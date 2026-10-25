import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { obiexConfig } from './obiex.config';
import { obiexClient, ObiexApiError } from './obiex.client';
import { getObiexIconPath } from './obiex.icons';
import {
  creditObiexAsset,
  debitObiexAsset,
  getObiexAvailable,
  listObiexUserAssets,
} from './obiex.ledger.service';
import {
  applySignedRateMarkup,
  formatAmountStr,
  getObiexConfigRow,
  obiexBuySourceNgn,
  resolveObiexMarkupForUsdAmount,
  roundNgn,
  userSellCreditNgn,
} from './obiex.markup';
import {
  listActiveObiexCurrencyMaps,
  resolveObiexLedgerCurrency,
} from './obiex.currency-map';
import {
  beginTradeRecon,
  finalizeTradeRecon,
} from './obiex.reconcile.service';
import { computeWithdrawFeeAmount } from '../busha/busha.ledger.service';
import { fundObiexNgnxViaPalmpayForBuy } from './obiex.ngn-deposit-fund.service';

const tradeModel = () => (prisma as any).obiexTradeLog;
const depositModel = () => (prisma as any).obiexDepositAddress;

/** Resolve Obiex network min/fee for a currency+network pair. */
async function resolveObiexWithdrawNetwork(currency: string, network: string) {
  const netMap = unwrapData(await obiexClient.getActiveNetworks()) || {};
  const entry = netMap[currency] || netMap[currency.toUpperCase()];
  const nets = Array.isArray(entry?.networks) ? entry.networks : [];
  const networkUpper = network.toUpperCase();
  const match =
    nets.find(
      (n: any) =>
        String(n?.networkCode || n?.code || '').toUpperCase() === networkUpper
    ) || null;
  const providerMin = match?.minimumWithdrawal != null
    ? parseFloat(String(match.minimumWithdrawal))
    : match?.minimum != null
      ? parseFloat(String(match.minimum))
      : NaN;
  const providerFee = match?.withdrawalFee != null
    ? parseFloat(String(match.withdrawalFee))
    : match?.fee != null
      ? parseFloat(String(match.fee))
      : 0;
  const feeType = String(match?.withdrawalFeeType || match?.feeType || 'FLAT').toUpperCase();
  return {
    match,
    networkName: match?.networkName ? String(match.networkName) : network,
    providerMin: Number.isFinite(providerMin) ? providerMin : null,
    providerFee: Number.isFinite(providerFee) ? providerFee : 0,
    feeType,
    isWithdrawable: match ? match.isWithdrawable !== false : true,
  };
}

function calcProviderNetworkFee(
  amount: number,
  providerFee: number,
  feeType: string
): number {
  if (!(providerFee > 0) || !(amount > 0)) return 0;
  if (feeType === 'PERCENTAGE' || feeType === 'PERCENT') {
    return (amount * providerFee) / 100;
  }
  return providerFee;
}

export async function assertObiexAppActive() {
  if (!obiexConfig.isConfigured()) {
    throw ApiError.badRequest('Obiex is not configured');
  }
  const settings = await getObiexConfigRow();
  if (!settings?.isActive) {
    throw ApiError.badRequest('Obiex is not active');
  }
  return settings;
}

function uniqueUserId(userId: number) {
  return `terescrow-user-${userId}`;
}

function unwrapData(res: any) {
  return res?.data ?? res;
}

/**
 * Prefer the coin's native network (BTC→BTC, ETH→ETH) over Obiex's unordered list
 * (e.g. BTC often comes back as [BSC, BTC] — we must not default to BSC).
 */
function pickDefaultObiexNetwork(currency: string, networks: string[]): string {
  const code = String(currency || '').toUpperCase();
  const nets = (networks || []).map((n) => String(n || '').toUpperCase()).filter(Boolean);
  if (!nets.length) return code || '';
  if (nets.includes(code)) return code;
  const nativeAliases: Record<string, string[]> = {
    BTC: ['BTC', 'BITCOIN'],
    ETH: ['ETH', 'ERC20', 'ETHEREUM'],
    BNB: ['BSC', 'BNB', 'BEP20'],
    TRX: ['TRX', 'TRC20', 'TRON'],
    SOL: ['SOL', 'SOLANA'],
    MATIC: ['MATIC', 'POLYGON'],
    AVAX: ['AVAX', 'AVALANCHE'],
    LTC: ['LTC', 'LITECOIN'],
    DOGE: ['DOGE', 'DOGECOIN'],
    XRP: ['XRP', 'RIPPLE'],
    TON: ['TON'],
    ADA: ['ADA', 'CARDANO'],
    DOT: ['DOT', 'POLKADOT'],
  };
  for (const alias of nativeAliases[code] || []) {
    if (nets.includes(alias)) return alias;
  }
  return nets[0];
}

/** Put preferred default first for UI pickers. */
function orderObiexNetworks(currency: string, networks: string[]): string[] {
  const preferred = pickDefaultObiexNetwork(currency, networks);
  const nets = (networks || []).map((n) => String(n || '').toUpperCase()).filter(Boolean);
  if (!preferred) return nets;
  return [preferred, ...nets.filter((n) => n !== preferred)];
}

export async function getAppObiexStatus(userId: number) {
  const configured = obiexConfig.isConfigured();
  let settings: any = null;
  try {
    settings = await getObiexConfigRow();
  } catch {
    settings = null;
  }
  const isActive = !!(configured && settings?.isActive);

  let assets: any[] = [];
  let networksByCurrency: Record<string, string[]> = {};
  let crypto: string[] = [];

  if (isActive) {
    try {
      const [tradable, networks] = await Promise.all([
        obiexClient.getTradableCurrencies(),
        obiexClient.getActiveNetworks(),
      ]);
      const list = Array.isArray(unwrapData(tradable)) ? unwrapData(tradable) : [];
      const netMap = unwrapData(networks) || {};
      crypto = list
        .filter((c: any) => c?.active !== false && String(c?.type || '').toUpperCase() !== 'FIAT')
        .map((c: any) => String(c.code || '').toUpperCase())
        .filter(Boolean);

      for (const code of Object.keys(netMap)) {
        const entry = netMap[code];
        const nets = Array.isArray(entry?.networks) ? entry.networks : [];
        const codes = nets
          .filter((n: any) => n?.isReceivable || n?.isWithdrawable)
          .map((n: any) => String(n.networkCode || n.code || '').toUpperCase())
          .filter(Boolean);
        networksByCurrency[code.toUpperCase()] = orderObiexNetworks(code, codes);
      }

      assets = crypto.map((code) => {
        const nets = networksByCurrency[code] || [];
        const netEntries = Array.isArray(netMap[code]?.networks) ? netMap[code].networks : [];
        return {
          code,
          name: code,
          networks: nets,
          defaultNetwork: pickDefaultObiexNetwork(code, nets),
          deposit: netEntries.some((n: any) => n?.isReceivable),
          withdraw: netEntries.some((n: any) => n?.isWithdrawable),
          rampBuy: true,
          rampSell: true,
          icon: getObiexIconPath(code),
          image: getObiexIconPath(code),
        };
      });
    } catch (e: any) {
      console.warn('[Obiex status] catalog fetch failed', e?.message || e);
    }
  }

  const ledger = isActive ? await listObiexUserAssets(userId) : [];

  return {
    configured,
    isActive,
    buyMode: settings?.buyMode || 'master_swap',
    collectionsTarget: settings?.collectionsTarget || 'USDT',
    needsKyc: false,
    canTrade: isActive,
    kycStatus: 'not_required',
    currencies: {
      fiat: ['NGN', 'NGNX'],
      crypto,
      rampCrypto: crypto,
      networksByCurrency,
      assets,
    },
    ledger: ledger.map((r: any) => ({
      currency: r.currency,
      available: String(r.userAvailable),
      icon: getObiexIconPath(r.currency),
    })),
  };
}

export async function getAppObiexPublicRates() {
  await assertObiexAppActive();
  const ratesRes = await obiexClient.getFiatRates();
  const rows = Array.isArray(unwrapData(ratesRes)) ? unwrapData(ratesRes) : [];
  const resolvedBuy = await resolveObiexMarkupForUsdAmount('buy', 100);
  const resolvedSell = await resolveObiexMarkupForUsdAmount('sell', 100);

  return {
    rates: rows.map((r: any) => {
      const buy = Number(r.buyRate);
      const sell = Number(r.sellRate);
      return {
        currency: r.currency,
        base: r.base || 'USDT',
        buyRate: applySignedRateMarkup(buy, resolvedBuy.percent),
        sellRate: applySignedRateMarkup(sell, resolvedSell.percent),
        rawBuyRate: buy,
        rawSellRate: sell,
        markup: {
          buyMarkupPercent: resolvedBuy.percent,
          sellMarkupPercent: resolvedSell.percent,
        },
      };
    }),
  };
}

export async function getAppObiexWallet(userId: number) {
  await assertObiexAppActive();
  const assets = await listObiexUserAssets(userId);
  return {
    balances: assets.map((a: any) => ({
      currency: a.currency,
      available: String(a.userAvailable),
      icon: getObiexIconPath(a.currency),
      image: getObiexIconPath(a.currency),
    })),
  };
}

/**
 * Busha-shaped assets list: catalog from ObiexCurrencyMap + ObiexUserAsset balances.
 * Same fields as getAppBushaAssets so mobile Assets screens can swap API with minimal change.
 */
export async function getAppObiexAssets(userId: number) {
  await assertObiexAppActive();

  const status = await getAppObiexStatus(userId);
  const statusAssets: any[] = status.currencies?.assets || [];
  const statusByCode = new Map(
    statusAssets.map((a: any) => [String(a.code || '').toUpperCase(), a])
  );

  const maps: any[] = await listActiveObiexCurrencyMaps();
  const ledgerRows: any[] = await listObiexUserAssets(userId);
  const ledgerByCode = new Map<string, any>(
    ledgerRows.map((a: any) => [String(a.currency).toUpperCase(), a])
  );

  const assets: any[] = [];
  const seenObiex = new Set<string>();

  for (const row of maps) {
    const appCode = String(row.appCurrency || '').toUpperCase();
    const obiexCode = String(row.obiexCurrency || appCode).toUpperCase();
    if (!appCode || seenObiex.has(obiexCode)) continue;
    seenObiex.add(obiexCode);

    const meta = statusByCode.get(obiexCode) || statusByCode.get(appCode);
    const netsFromMap = Array.isArray(row.networks) ? (row.networks as string[]) : null;
    const networksRaw: string[] =
      netsFromMap ||
      meta?.networks ||
      status.currencies?.networksByCurrency?.[obiexCode] ||
      [obiexCode];
    const networks = orderObiexNetworks(appCode, networksRaw);
    // Always prefer native (BTC→BTC). Ignore provider meta.defaultNetwork when it is BSC/etc.
    const defaultNetwork = pickDefaultObiexNetwork(appCode, networks);
    const ledger = ledgerByCode.get(obiexCode);
    const available = ledger
      ? formatAmountStr(Number(ledger.userAvailable ?? 0), 8)
      : '0';
    const amt = parseFloat(available) || 0;
    const isStable = ['USDT', 'USDC', 'USD'].includes(appCode);
    const balanceUsd = isStable ? String(amt) : '0';

    assets.push({
      id: -(assets.length + 1),
      currency: appCode,
      blockchain: defaultNetwork || appCode,
      symbol: getObiexIconPath(appCode) || getObiexIconPath(obiexCode) || appCode,
      name: row.displayName || meta?.name || appCode,
      balance: available,
      availableBalance: available,
      balanceUsd,
      balanceNaira: '0',
      price: '0',
      nairaPrice: '0',
      depositAddress: '',
      active: true,
      frozen: false,
      networks,
      defaultNetwork,
      obiexCurrency: obiexCode,
      icon: getObiexIconPath(appCode) || getObiexIconPath(obiexCode),
      image: getObiexIconPath(appCode) || getObiexIconPath(obiexCode),
      source: 'obiex' as const,
    });
  }

  // Include any ledger balances not in the map
  for (const [code, ledger] of ledgerByCode.entries()) {
    if (seenObiex.has(code)) continue;
    seenObiex.add(code);
    const available = formatAmountStr(Number((ledger as any).userAvailable ?? 0), 8);
    const amt = parseFloat(available) || 0;
    const isStable = ['USDT', 'USDC', 'USD'].includes(code);
    const networks = orderObiexNetworks(
      code,
      status.currencies?.networksByCurrency?.[code] || [code]
    );
    const defaultNetwork = pickDefaultObiexNetwork(code, networks);
    assets.push({
      id: -(assets.length + 1),
      currency: code,
      blockchain: defaultNetwork || code,
      symbol: getObiexIconPath(code) || code,
      name: code,
      balance: available,
      availableBalance: available,
      balanceUsd: isStable ? String(amt) : '0',
      balanceNaira: '0',
      price: '0',
      nairaPrice: '0',
      depositAddress: '',
      active: true,
      frozen: false,
      networks,
      defaultNetwork,
      obiexCurrency: code,
      icon: getObiexIconPath(code),
      image: getObiexIconPath(code),
      source: 'obiex' as const,
    });
  }

  let totalUsd = 0;
  for (const a of assets) {
    const amt = parseFloat(a.balance || '0');
    if (['USDT', 'USDC', 'USD'].includes(a.currency) && Number.isFinite(amt)) {
      totalUsd += amt;
    }
  }

  return {
    assets,
    totals: {
      totalUsd: String(totalUsd),
      totalNaira: '0',
    },
    count: assets.length,
    source: 'obiex' as const,
  };
}

function mapObiexSideToTxType(side: string): string {
  const s = String(side || '').toLowerCase();
  if (s === 'buy') return 'BUY';
  if (s === 'sell') return 'SELL';
  if (s === 'receive') return 'RECEIVE';
  if (s === 'send') return 'SEND';
  if (s === 'convert' || s === 'swap') return 'SWAP';
  return s.toUpperCase();
}

function mapObiexTradeToAssetTx(t: any) {
  const side = String(t.side || '').toLowerCase();
  const source = String(t.sourceCurrency || '').toUpperCase();
  const target = String(t.targetCurrency || '').toUpperCase();
  const sourceAmount = String(t.sourceAmount ?? '0');
  const targetAmount =
    t.targetAmount != null && t.targetAmount !== '' ? String(t.targetAmount) : undefined;
  const type = mapObiexSideToTxType(t.side);

  let currency = source;
  let amount = sourceAmount;
  let amountNaira: string | undefined;

  if (side === 'buy') {
    currency = target || source;
    amount = targetAmount || sourceAmount;
    if (source === 'NGN') amountNaira = sourceAmount;
  } else if (side === 'sell') {
    currency = source;
    amount = sourceAmount;
    if (target === 'NGN') amountNaira = targetAmount;
  } else if (side === 'receive') {
    currency = target || source;
    amount = targetAmount || sourceAmount;
  }

  return {
    id: t.id,
    transactionId: t.id,
    type,
    transactionType: type,
    side: t.side,
    currency,
    cryptocurrencyType: currency,
    amount,
    amountNaira,
    fromCurrency: side === 'convert' || side === 'swap' ? source : undefined,
    toCurrency: side === 'convert' || side === 'swap' ? target : undefined,
    fromAmount: side === 'convert' || side === 'swap' ? sourceAmount : undefined,
    toAmount: side === 'convert' || side === 'swap' ? targetAmount : undefined,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    source: 'obiex' as const,
  };
}

export async function getAppObiexAssetDetail(userId: number, currency: string) {
  await assertObiexAppActive();
  // Keep app ticker as stored (USDT/MATIC) — do not remap via CMC aliases (MATIC≠POL).
  const appCode = String(currency || '')
    .trim()
    .toUpperCase()
    .replace(/^USDT_.*/, 'USDT')
    .replace(/^USDC_.*/, 'USDC');
  if (!appCode) throw ApiError.badRequest('currency required');

  const ledgerCode = await resolveObiexLedgerCurrency(appCode);
  // Prefer live ledger row so detail always matches credited balance.
  const availableNum = await getObiexAvailable(userId, ledgerCode);
  const available = formatAmountStr(availableNum, 8);
  const isStable = ['USDT', 'USDC', 'USD'].includes(appCode);
  const balanceUsd = isStable ? formatAmountStr(availableNum, 2) : '0';

  const listed = await getAppObiexAssets(userId);
  const asset =
    listed.assets.find((a: any) => String(a.currency).toUpperCase() === appCode) ||
    listed.assets.find((a: any) => String(a.obiexCurrency || '').toUpperCase() === ledgerCode);

  const row = asset || {
    id: -1,
    currency: appCode,
    blockchain: appCode,
    symbol: getObiexIconPath(appCode) || appCode,
    name: appCode,
    networks: [appCode],
    defaultNetwork: appCode,
    obiexCurrency: ledgerCode,
    icon: getObiexIconPath(appCode),
    image: getObiexIconPath(appCode),
  };

  const trades = await tradeModel().findMany({
    where: {
      userId,
      OR: [{ sourceCurrency: ledgerCode }, { targetCurrency: ledgerCode }],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return {
    ...row,
    balance: available,
    availableBalance: available,
    accountBalance: available,
    balanceUsd,
    availableBalanceUsd: balanceUsd,
    accountBalanceUsd: balanceUsd,
    balanceNaira: '0',
    availableBalanceNaira: '0',
    accountBalanceNaira: '0',
    accountCode: appCode,
    accountId: appCode,
    transactions: trades.map((t: any) => mapObiexTradeToAssetTx(t)),
    source: 'obiex' as const,
  };
}

export async function getAppObiexDepositAddress(
  userId: number,
  currency: string,
  network: string
) {
  await assertObiexAppActive();
  const code = String(currency).toUpperCase();
  const net = String(network).toUpperCase();
  if (!code || !net) throw ApiError.badRequest('currency and network required');

  const existing = await depositModel().findUnique({
    where: { userId_currency_network: { userId, currency: code, network: net } },
  });
  if (existing?.address) {
    return {
      currency: code,
      network: net,
      address: existing.address,
      icon: getObiexIconPath(code),
    };
  }

  const uid = uniqueUserId(userId);
  const res = await obiexClient.createDepositAddress({
    uniqueUserIdentifier: uid,
    currency: code,
    network: net,
  });
  const data = unwrapData(res);
  const address =
    data?.address || data?.walletAddress || data?.depositAddress || data?.data?.address;
  if (!address) throw ApiError.badRequest('Obiex did not return a deposit address');

  await depositModel().upsert({
    where: { userId_currency_network: { userId, currency: code, network: net } },
    create: {
      userId,
      currency: code,
      network: net,
      address: String(address),
      uniqueUserIdentifier: uid,
      providerData: data,
    },
    update: {
      address: String(address),
      providerData: data,
    },
  });

  return {
    currency: code,
    network: net,
    address: String(address),
    icon: getObiexIconPath(code),
  };
}

export async function previewAppObiexBuy(
  userId: number,
  params: { sourceAmount: string; targetCurrency: string; usdAmount?: string | number | null }
) {
  const settings = await assertObiexAppActive();
  const userNgn = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(userNgn) || userNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  const target = String(params.targetCurrency || 'USDT').toUpperCase();
  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'buy',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : userNgn / 1500
  );
  const obiexNgn = roundNgn(obiexBuySourceNgn(userNgn, resolved.percent));
  if (obiexNgn <= 0) throw ApiError.badRequest('Buy amount too small after markup');

  const rates = await getAppObiexPublicRates();
  const ngnRate = rates.rates.find((r: any) => String(r.currency).toUpperCase() === 'NGNX');
  const buyRate = Number(ngnRate?.buyRate) || 0;
  const estimatedCrypto = buyRate > 0 ? obiexNgn / buyRate : 0;

  return {
    buyMode: settings.buyMode,
    quote: {
      source_currency: 'NGN',
      target_currency: target,
      source_amount: formatAmountStr(userNgn, 2),
      target_amount: formatAmountStr(estimatedCrypto, 8),
      rate: buyRate,
    },
    markup: {
      buyMarkupPercent: resolved.percent,
      markupSource: resolved.source,
      rangeId: resolved.rangeId ?? null,
      obiexSourceAmount: formatAmountStr(obiexNgn, 2),
      platformSpreadNgn: formatAmountStr(userNgn - obiexNgn, 2),
    },
  };
}

async function reverseBuyDebit(
  userId: number,
  fiatTxnId: string,
  amountNgn: number,
  reason: string
) {
  try {
    const wallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    await fiatWalletService.creditWallet(wallet.id, amountNgn, fiatTxnId);
  } catch (e: any) {
    console.error('[Obiex buy] reverse debit failed', e?.message || e);
  }
  await prisma.fiatTransaction.update({
    where: { id: fiatTxnId },
    data: { status: 'failed', description: reason },
  });
}

export async function executeAppObiexBuy(
  userId: number,
  params: {
    sourceAmount: string;
    targetCurrency: string;
    usdAmount?: string | number | null;
    customer?: {
      firstName?: string;
      lastName?: string;
      bvn?: string;
      nin?: string;
    };
  }
) {
  const settings = await assertObiexAppActive();
  const userNgn = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(userNgn) || userNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  const target = String(params.targetCurrency || 'USDT').toUpperCase();
  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'buy',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : userNgn / 1500
  );
  const obiexNgn = roundNgn(obiexBuySourceNgn(userNgn, resolved.percent));
  const platformSpreadNgn = roundNgn(userNgn - obiexNgn);

  const buyMode = String(settings.buyMode || 'master_swap');

  if (buyMode === 'collections_va') {
    const c = params.customer || {};
    if (!c.firstName || !c.lastName || !c.bvn || !c.nin) {
      throw ApiError.badRequest('customer firstName, lastName, bvn, nin required for collections_va');
    }
    const collectionsTarget = String(settings.collectionsTarget || 'USDT').toUpperCase();
    const res = await obiexClient.initiateCollection({
      customer: {
        firstName: c.firstName,
        lastName: c.lastName,
        bvn: c.bvn,
        nin: c.nin,
      },
      collectionType: 'FIAT',
      sourceCurrency: 'NGNX',
      targetCurrency: collectionsTarget === 'USDC' ? 'USDC' : 'USDT',
      amount: userNgn,
    });
    const data = unwrapData(res);
    const trade = await tradeModel().create({
      data: {
        userId,
        side: 'buy',
        sourceCurrency: 'NGN',
        targetCurrency: collectionsTarget,
        sourceAmount: formatAmountStr(userNgn, 2),
        obiexReference: data?.transactionReference || data?.reference || null,
        obiexStatus: 'PENDING',
        status: 'awaiting_payment',
        initiatedById: userId,
        providerResponse: {
          buyMode: 'collections_va',
          collection: data,
          markup: {
            buyMarkupPercent: resolved.percent,
            markupSource: resolved.source,
            userSourceAmount: formatAmountStr(userNgn, 2),
          },
        },
      },
    });
    return {
      trade,
      collection: {
        reference: data?.transactionReference,
        expiresAt: data?.expiresAt,
        account: data?.account,
        targetCurrency: collectionsTarget,
      },
    };
  }

  // master_swap
  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const balance = parseFloat(String(fiatWallet.balance));
  if (balance < userNgn) throw ApiError.badRequest('Insufficient NGN wallet balance');

  const fiatTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: fiatWallet.id,
      type: 'CRYPTO_BUY',
      status: 'pending',
      currency: 'NGN',
      amount: userNgn,
      fees: platformSpreadNgn,
      totalAmount: userNgn,
      description: `Obiex buy ${target}`,
    },
  });

  try {
    await fiatWalletService.debitWallet(fiatWallet.id, userNgn, fiatTxn.id);
  } catch (error: any) {
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: { status: 'failed' },
    });
    throw ApiError.badRequest(error?.message || 'Failed to debit NGN wallet');
  }

  const ledgerCurrency = await resolveObiexLedgerCurrency(target);
  const trade = await tradeModel().create({
    data: {
      userId,
      side: 'buy',
      sourceCurrency: 'NGN',
      targetCurrency: ledgerCurrency,
      sourceAmount: formatAmountStr(userNgn, 2),
      fiatTransactionId: fiatTxn.id,
      status: 'processing',
      initiatedById: userId,
      providerResponse: {
        buyMode: 'master_swap',
        markup: {
          buyMarkupPercent: resolved.percent,
          markupSource: resolved.source,
          rangeId: resolved.rangeId ?? null,
          userSourceAmount: formatAmountStr(userNgn, 2),
          obiexSourceAmount: formatAmountStr(obiexNgn, 2),
          platformSpreadNgn: formatAmountStr(platformSpreadNgn, 2),
        },
      },
    },
  });

  try {
    await beginTradeRecon({
      tradeLogId: trade.id,
      userId,
      side: 'buy',
      coinCurrency: ledgerCurrency,
      expectedMasterNgnxDelta: -obiexNgn,
      includeNgnx: true,
    });

    // Fund Obiex NGNX for this buy: issue amount-locked VA, PalmPay-payout exact amount
    // (fee deducted by Obiex → credit ≈ amount − fee). Admin-only note; user buy UX unchanged.
    const skipVaFund =
      String(process.env.OBIEX_BUY_SKIP_VA_FUND || '').toLowerCase() === 'true' ||
      String(process.env.OBIEX_BUY_SKIP_VA_FUND || '') === '1';

    let fundingAdminNote: Record<string, unknown> | null = null;
    if (!skipVaFund) {
      const funding = await fundObiexNgnxViaPalmpayForBuy({
        creditNeededNgn: obiexNgn,
        tradeId: trade.id,
        userId,
      });
      fundingAdminNote = funding.adminNote;
      await tradeModel().update({
        where: { id: trade.id },
        data: {
          providerResponse: {
            buyMode: 'master_swap',
            funding: fundingAdminNote,
            markup: {
              buyMarkupPercent: resolved.percent,
              markupSource: resolved.source,
              rangeId: resolved.rangeId ?? null,
              userSourceAmount: formatAmountStr(userNgn, 2),
              obiexSourceAmount: formatAmountStr(obiexNgn, 2),
              platformSpreadNgn: formatAmountStr(platformSpreadNgn, 2),
            },
          },
        },
      });
      try {
        await prisma.fiatTransaction.update({
          where: { id: fiatTxn.id },
          data: {
            metadata: JSON.stringify({
              adminOnly: true,
              obiexNgnDepositFunding: fundingAdminNote,
            }),
          },
        });
      } catch {
        /* metadata column optional / best-effort */
      }
    } else {
      const balRes = await obiexClient.getWalletBalance('NGNX');
      const available = Number(
        unwrapData(balRes)?.availableBalance ?? unwrapData(balRes)?.totalSwappableBalance ?? 0
      );
      if (available + 1e-9 < obiexNgn) {
        throw ApiError.badRequest('Obiex NGNX float insufficient — fund master wallet');
      }
    }

    const swap = await obiexClient.instantSwap({
      sourceId: 'NGNX',
      targetId: ledgerCurrency,
      amount: obiexNgn,
      side: 'SELL',
    });
    const swapData = unwrapData(swap);
    const received = Number(swapData?.amountReceived ?? swapData?.targetAmount ?? 0);
    if (!Number.isFinite(received) || received <= 0) {
      throw ApiError.badRequest('Obiex swap returned no crypto amount');
    }

    await creditObiexAsset(userId, ledgerCurrency, received);
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: { status: 'completed' },
    });

    await finalizeTradeRecon({
      tradeLogId: trade.id,
      expectedMasterNgnxDelta: -obiexNgn,
      expectedMasterCoinDelta: received,
      expectedUserLedgerDelta: received,
      includeNgnx: true,
    });

    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        targetAmount: formatAmountStr(received, 8),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        status: 'completed',
        completedAt: new Date(),
        providerResponse: {
          buyMode: 'master_swap',
          ...(fundingAdminNote ? { funding: fundingAdminNote } : {}),
          swap: swapData,
          markup: {
            buyMarkupPercent: resolved.percent,
            markupSource: resolved.source,
            rangeId: resolved.rangeId ?? null,
            userSourceAmount: formatAmountStr(userNgn, 2),
            obiexSourceAmount: formatAmountStr(obiexNgn, 2),
            platformSpreadNgn: formatAmountStr(platformSpreadNgn, 2),
          },
        },
      },
    });

    // User-facing payload stays a normal completed buy (no funding / VA details).
    return { trade: updated };
  } catch (error: any) {
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'Obiex buy failed',
      },
    }).catch(() => undefined);
    try {
      await finalizeTradeRecon({ tradeLogId: trade.id, includeNgnx: true });
    } catch {
      /* best-effort after snapshot */
    }
    await reverseBuyDebit(userId, fiatTxn.id, userNgn, error?.message || 'Obiex buy failed');
    if (error instanceof ApiError) throw error;
    if (error instanceof ObiexApiError) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
}

export async function previewAppObiexSell(
  userId: number,
  params: { sourceAmount: string; sourceCurrency: string; usdAmount?: string | number | null }
) {
  await assertObiexAppActive();
  const amount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  const source = String(params.sourceCurrency || 'USDT').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  const available = await getObiexAvailable(userId, source);
  if (available + 1e-12 < amount) throw ApiError.badRequest(`Insufficient ${source}`);

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'sell',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : amount
  );

  const rates = await getAppObiexPublicRates();
  const ngnRate = rates.rates.find((r: any) => String(r.currency).toUpperCase() === 'NGNX');
  const rawSell = Number(ngnRate?.rawSellRate ?? ngnRate?.sellRate) || 0;
  const obiexNgn = roundNgn(amount * rawSell);
  const userNgn = roundNgn(userSellCreditNgn(obiexNgn, resolved.percent));

  return {
    quote: {
      source_currency: source,
      target_currency: 'NGN',
      source_amount: formatAmountStr(amount, 8),
      target_amount: formatAmountStr(userNgn, 2),
      rate: applySignedRateMarkup(rawSell, resolved.percent),
    },
    markup: {
      sellMarkupPercent: resolved.percent,
      markupSource: resolved.source,
      obiexTargetAmount: formatAmountStr(obiexNgn, 2),
      userCreditNgn: formatAmountStr(userNgn, 2),
    },
  };
}

export async function executeAppObiexSell(
  userId: number,
  params: { sourceAmount: string; sourceCurrency: string; usdAmount?: string | number | null }
) {
  await assertObiexAppActive();
  const amount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  const sourceRaw = String(params.sourceCurrency || 'USDT').toUpperCase();
  const source = await resolveObiexLedgerCurrency(sourceRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'sell',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : amount
  );

  const trade = await tradeModel().create({
    data: {
      userId,
      side: 'sell',
      sourceCurrency: source,
      targetCurrency: 'NGN',
      sourceAmount: formatAmountStr(amount, 8),
      status: 'processing',
      initiatedById: userId,
    },
  });

  await beginTradeRecon({
    tradeLogId: trade.id,
    userId,
    side: 'sell',
    coinCurrency: source,
    expectedUserLedgerDelta: -amount,
    includeNgnx: true,
  });

  await debitObiexAsset(userId, source, amount);

  try {
    const swap = await obiexClient.instantSwap({
      sourceId: source,
      targetId: 'NGNX',
      amount,
      side: 'SELL',
    });
    const swapData = unwrapData(swap);
    const obiexNgn = Number(swapData?.amountReceived ?? 0);
    if (!Number.isFinite(obiexNgn) || obiexNgn <= 0) {
      throw ApiError.badRequest('Obiex sell swap returned no NGNX');
    }
    const userNgn = roundNgn(userSellCreditNgn(obiexNgn, resolved.percent));

    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const fiatTxn = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId,
        walletId: fiatWallet.id,
        type: 'CRYPTO_SELL',
        status: 'completed',
        currency: 'NGN',
        amount: userNgn,
        fees: roundNgn(Math.max(0, obiexNgn - userNgn)),
        totalAmount: userNgn,
        description: `Obiex sell ${source}`,
      },
    });
    await fiatWalletService.creditWallet(fiatWallet.id, userNgn, fiatTxn.id);

    await finalizeTradeRecon({
      tradeLogId: trade.id,
      expectedMasterNgnxDelta: obiexNgn,
      expectedMasterCoinDelta: -amount,
      expectedUserLedgerDelta: -amount,
      includeNgnx: true,
    });

    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        targetAmount: formatAmountStr(userNgn, 2),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        fiatTransactionId: fiatTxn.id,
        status: 'completed',
        completedAt: new Date(),
        providerResponse: {
          swap: swapData,
          markup: {
            sellMarkupPercent: resolved.percent,
            markupSource: resolved.source,
            obiexTargetAmount: formatAmountStr(obiexNgn, 2),
            userCreditNgn: formatAmountStr(userNgn, 2),
          },
        },
      },
    });

    return { trade: updated };
  } catch (error: any) {
    await creditObiexAsset(userId, source, amount);
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'Obiex sell failed',
      },
    }).catch(() => undefined);
    try {
      await finalizeTradeRecon({ tradeLogId: trade.id, includeNgnx: true });
    } catch {
      /* best-effort */
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof ObiexApiError) throw ApiError.badRequest(error.message);
    throw error;
  }
}

export async function previewAppObiexConvert(
  userId: number,
  params: { sourceCurrency: string; targetCurrency: string; sourceAmount: string }
) {
  await assertObiexAppActive();
  const source = String(params.sourceCurrency).toUpperCase();
  const target = String(params.targetCurrency).toUpperCase();
  const amount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  const available = await getObiexAvailable(userId, source);
  if (available + 1e-12 < amount) throw ApiError.badRequest(`Insufficient ${source}`);

  // Best-effort estimate via instant quote path (createQuote is rate-limited — use swap estimate from pairs if needed)
  return {
    quote: {
      source_currency: source,
      target_currency: target,
      source_amount: formatAmountStr(amount, 8),
    },
    available: formatAmountStr(available, 8),
  };
}

export async function executeAppObiexConvert(
  userId: number,
  params: { sourceCurrency: string; targetCurrency: string; sourceAmount: string }
) {
  await assertObiexAppActive();
  const source = await resolveObiexLedgerCurrency(String(params.sourceCurrency).toUpperCase());
  const target = await resolveObiexLedgerCurrency(String(params.targetCurrency).toUpperCase());
  const amount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  if (source === target) throw ApiError.badRequest('source and target must differ');

  const trade = await tradeModel().create({
    data: {
      userId,
      side: 'convert',
      sourceCurrency: source,
      targetCurrency: target,
      sourceAmount: formatAmountStr(amount, 8),
      status: 'processing',
      initiatedById: userId,
    },
  });

  // Recon tracks source coin master + user ledger; includeNgnx false for crypto-crypto.
  await beginTradeRecon({
    tradeLogId: trade.id,
    userId,
    side: 'convert',
    coinCurrency: source,
    expectedUserLedgerDelta: -amount,
    expectedMasterCoinDelta: -amount,
    includeNgnx: false,
  });

  await debitObiexAsset(userId, source, amount);
  try {
    const swap = await obiexClient.instantSwap({
      sourceId: source,
      targetId: target,
      amount,
      side: 'SELL',
    });
    const swapData = unwrapData(swap);
    const received = Number(swapData?.amountReceived ?? 0);
    if (!Number.isFinite(received) || received <= 0) {
      throw ApiError.badRequest('Obiex convert returned no amount');
    }
    await creditObiexAsset(userId, target, received);

    await finalizeTradeRecon({
      tradeLogId: trade.id,
      expectedMasterCoinDelta: -amount,
      expectedUserLedgerDelta: -amount,
      includeNgnx: false,
    });

    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        targetAmount: formatAmountStr(received, 8),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        status: 'completed',
        completedAt: new Date(),
        providerResponse: { swap: swapData, targetReceived: received },
      },
    });
    return { trade: updated };
  } catch (error: any) {
    await creditObiexAsset(userId, source, amount);
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'Obiex convert failed',
      },
    }).catch(() => undefined);
    try {
      await finalizeTradeRecon({ tradeLogId: trade.id, includeNgnx: false });
    } catch {
      /* best-effort */
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof ObiexApiError) throw ApiError.badRequest(error.message);
    throw error;
  }
}

export async function previewAppObiexSend(
  userId: number,
  params: { currency: string; amount: string; network: string; address: string }
) {
  await assertObiexAppActive();
  const currency = String(params.currency).toUpperCase();
  const network = String(params.network).toUpperCase();
  const amount = parseFloat(String(params.amount).replace(/,/g, ''));
  const address = String(params.address || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
  if (!currency || !network) {
    throw ApiError.badRequest('currency and network required');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }

  const available = await getObiexAvailable(userId, currency);
  const netInfo = await resolveObiexWithdrawNetwork(currency, network);
  const providerNetworkFee = calcProviderNetworkFee(
    amount,
    netInfo.providerFee,
    netInfo.feeType
  );
  const platformFeeDec = await computeWithdrawFeeAmount(currency, amount);
  const platformFee = parseFloat(platformFeeDec.toString()) || 0;
  const combinedFee = platformFee + providerNetworkFee;
  const totalDebit = amount + combinedFee;

  // UI min = Obiex minimumWithdrawal + flat network fee (matches live Obiex preview).
  const minWithdrawNum =
    netInfo.providerMin != null
      ? netInfo.providerMin +
        (netInfo.feeType === 'FLAT' || !netInfo.feeType
          ? netInfo.providerFee
          : 0)
      : null;
  const belowMinimum =
    minWithdrawNum != null && Number.isFinite(amount) && amount < minWithdrawNum;
  const sufficient =
    Number.isFinite(available) && available + 1e-12 >= totalDebit;
  const canProceed =
    !!address &&
    sufficient &&
    !belowMinimum &&
    netInfo.isWithdrawable !== false;

  const combinedFeeStr = formatAmountStr(combinedFee, 8);
  const platformFeeStr = formatAmountStr(platformFee, 8);
  const providerFeeStr = formatAmountStr(providerNetworkFee, 8);
  const fees: any[] = [
    {
      name: 'fee',
      type: 'FIXED',
      amount: { amount: combinedFeeStr, currency },
    },
  ];
  if (platformFee > 0) {
    fees.push({
      name: 'platform_fee',
      type: 'PERCENT',
      amount: { amount: platformFeeStr, currency },
    });
  }
  if (providerNetworkFee > 0) {
    fees.push({
      name: 'network_fee',
      type: 'FIXED',
      amount: { amount: providerFeeStr, currency },
    });
  }

  return {
    currency,
    network,
    networkName: netInfo.networkName,
    amount: String(params.amount),
    available: formatAmountStr(available, 8),
    sufficient,
    hasSufficientBalance: sufficient,
    canProceed,
    toAddress: address || null,
    fees,
    networkFee: combinedFeeStr,
    networkFeeCurrency: currency,
    withdrawalFee: combinedFeeStr,
    platformFee: platformFeeStr,
    providerNetworkFee: providerFeeStr,
    minWithdraw: minWithdrawNum != null ? formatAmountStr(minWithdrawNum, 8) : null,
    belowMinimum,
    totalDebit: formatAmountStr(totalDebit, 8),
  };
}

export async function executeAppObiexSend(
  userId: number,
  params: { currency: string; amount: string; network: string; address: string }
) {
  await assertObiexAppActive();
  const currency = await resolveObiexLedgerCurrency(String(params.currency).toUpperCase());
  const network = String(params.network).toUpperCase();
  const amount = parseFloat(String(params.amount).replace(/,/g, ''));
  const address = String(params.address || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }
  if (!address) throw ApiError.badRequest('address required');

  const netInfo = await resolveObiexWithdrawNetwork(currency, network);
  if (netInfo.isWithdrawable === false) {
    throw ApiError.badRequest(`${currency} withdrawals on ${network} are not available`);
  }
  const providerNetworkFee = calcProviderNetworkFee(
    amount,
    netInfo.providerFee,
    netInfo.feeType
  );
  const platformFeeDec = await computeWithdrawFeeAmount(currency, amount);
  const platformFee = parseFloat(platformFeeDec.toString()) || 0;
  const totalDebit = amount + platformFee + providerNetworkFee;
  const minWithdrawNum =
    netInfo.providerMin != null
      ? netInfo.providerMin +
        (netInfo.feeType === 'FLAT' || !netInfo.feeType ? netInfo.providerFee : 0)
      : null;
  if (minWithdrawNum != null && amount < minWithdrawNum) {
    throw ApiError.badRequest(
      `Minimum send on ${network} is ${formatAmountStr(minWithdrawNum, 8)} ${currency}`
    );
  }

  const available = await getObiexAvailable(userId, currency);
  if (available + 1e-12 < totalDebit) {
    throw ApiError.badRequest(
      `Insufficient ${currency}. Need ${formatAmountStr(totalDebit, 8)} (incl. fees), available ${formatAmountStr(available, 8)}`
    );
  }

  const trade = await tradeModel().create({
    data: {
      userId,
      side: 'send',
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount: formatAmountStr(amount, 8),
      withdrawAddress: address,
      withdrawNetwork: network,
      status: 'processing',
      initiatedById: userId,
      providerResponse: {
        fees: {
          platformFee,
          providerNetworkFee,
          totalDebit,
        },
      },
    },
  });

  await beginTradeRecon({
    tradeLogId: trade.id,
    userId,
    side: 'send',
    coinCurrency: currency,
    expectedUserLedgerDelta: -totalDebit,
    expectedMasterCoinDelta: -(amount + providerNetworkFee),
    includeNgnx: false,
  });

  await debitObiexAsset(userId, currency, totalDebit);

  try {
    const res = await obiexClient.withdrawCrypto({
      currency,
      amount,
      destination: { address, network },
    });
    const data = unwrapData(res);

    await finalizeTradeRecon({
      tradeLogId: trade.id,
      expectedMasterCoinDelta: -(amount + providerNetworkFee),
      expectedUserLedgerDelta: -totalDebit,
      includeNgnx: false,
    });

    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        obiexReference: data?.reference ? String(data.reference) : null,
        obiexTransactionId: data?.transactionId || data?.id ? String(data.transactionId || data.id) : null,
        obiexStatus: data?.status || 'PROCESSING',
        status: 'processing',
        providerResponse: {
          ...(typeof data === 'object' && data ? data : { raw: data }),
          fees: { platformFee, providerNetworkFee, totalDebit },
        },
      },
    });
    return { trade: updated };
  } catch (error: any) {
    await creditObiexAsset(userId, currency, totalDebit);
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'Obiex withdraw failed',
      },
    });
    try {
      await finalizeTradeRecon({ tradeLogId: trade.id, includeNgnx: false });
    } catch {
      /* best-effort */
    }
    if (error instanceof ObiexApiError) throw ApiError.badRequest(error.message);
    throw error;
  }
}

/** History list — does not require Obiex isActive so past trades remain visible. */
export async function listAppObiexTrades(userId: number, limit = 50) {
  return tradeModel().findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  });
}

/** Detail for history — works even if Obiex was later deactivated. */
export async function getAppObiexTrade(userId: number, id: string) {
  const trade = await tradeModel().findFirst({ where: { id, userId } });
  if (!trade) throw ApiError.notFound('Trade not found');
  return trade;
}
