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
  buildObiexFeesForAdmin,
  formatAmountStr,
  getObiexConfigRow,
  getObiexFlatFeesNgn,
  resolveObiexMarkupForUsdAmount,
  roundNgn,
  splitObiexBuyUserDebit,
  splitObiexSellUserCredit,
} from './obiex.markup';
import {
  isObiexCurrencyHidden,
  listActiveObiexCurrencyMaps,
  resolveObiexLedgerCurrency,
} from './obiex.currency-map';
import {
  beginTradeRecon,
  finalizeTradeRecon,
} from './obiex.reconcile.service';
import { computeWithdrawFeeAmount } from '../busha/busha.ledger.service';
import { fundObiexNgnxViaPalmpayForBuy } from './obiex.ngn-deposit-fund.service';
import { settleObiexSellNgnxToBusinessAccount } from './obiex.sell-settlement.service';
import { resolveObiexSwapLeg } from './obiex.swap.service';

const tradeModel = () => (prisma as any).obiexTradeLog;
const depositModel = () => (prisma as any).obiexDepositAddress;

/** Block hidden coins (e.g. XRP) on deposit / buy / sell / send. */
function assertObiexCurrencyVisible(currency: string) {
  if (isObiexCurrencyHidden(currency)) {
    throw ApiError.badRequest(
      `${String(currency).toUpperCase()} is temporarily unavailable. Please choose another asset.`
    );
  }
}

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
    throw ApiError.badRequest('Crypto trading is temporarily unavailable. Please try again later.');
  }
  const settings = await getObiexConfigRow();
  if (!settings?.isActive) {
    throw ApiError.badRequest('Crypto trading is temporarily unavailable. Please try again later.');
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

function extractObiexNetworkCodes(
  netEntries: any[],
  predicate: (n: any) => boolean
): string[] {
  return (Array.isArray(netEntries) ? netEntries : [])
    .filter(predicate)
    .map((n: any) => String(n.networkCode || n.code || '').toUpperCase())
    .filter(Boolean);
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
  /** Deposit / receive only — excludes withdraw-only networks that break address issuance. */
  let networksReceivableByCurrency: Record<string, string[]> = {};
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
        .filter((code: string) => !!code && !isObiexCurrencyHidden(code));

      for (const code of Object.keys(netMap)) {
        if (isObiexCurrencyHidden(code)) continue;
        const entry = netMap[code];
        const nets = Array.isArray(entry?.networks) ? entry.networks : [];
        const upper = code.toUpperCase();
        const receivable = extractObiexNetworkCodes(nets, (n) => !!n?.isReceivable);
        const depositOrWithdraw = extractObiexNetworkCodes(
          nets,
          (n) => !!(n?.isReceivable || n?.isWithdrawable)
        );
        networksReceivableByCurrency[upper] = orderObiexNetworks(code, receivable);
        networksByCurrency[upper] = orderObiexNetworks(code, depositOrWithdraw);
      }

      assets = crypto.map((code) => {
        const receivableNets = networksReceivableByCurrency[code] || [];
        const allNets = networksByCurrency[code] || [];
        const netEntries = Array.isArray(netMap[code]?.networks) ? netMap[code].networks : [];
        const deposit = netEntries.some((n: any) => n?.isReceivable);
        return {
          code,
          name: code,
          /** Prefer receivable nets for deposit UX; fall back to deposit|withdraw list. */
          networks: deposit && receivableNets.length ? receivableNets : allNets,
          defaultNetwork: pickDefaultObiexNetwork(
            code,
            deposit && receivableNets.length ? receivableNets : allNets
          ),
          deposit,
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
      networksReceivableByCurrency,
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

/** Fiat rates from Obiex are NGNX↔USDT only — not per-altcoin. */
function isObiexUsdStable(currency: string): boolean {
  return ['USDT', 'USDC', 'USD', 'NGNX', 'NGN'].includes(String(currency || '').toUpperCase());
}

/**
 * Estimate crypto received for a buy of `obiexNgn` NGNX.
 * Stables: NGNX fiat buy rate. Alts (TRX/BTC/…): live Obiex pair quote.
 * Returns NGN-per-1-coin rate for UI.
 */
async function estimateObiexBuyFromNgnx(
  targetCurrency: string,
  obiexNgn: number
): Promise<{ cryptoAmount: number; rawRateNgnPerCoin: number; quoteSource: string }> {
  const target = String(targetCurrency || 'USDT').toUpperCase();
  if (isObiexUsdStable(target) && target !== 'NGNX' && target !== 'NGN') {
    const rates = await getAppObiexPublicRates();
    const ngnRate = rates.rates.find((r: any) => String(r.currency).toUpperCase() === 'NGNX');
    const rawBuy = Number(ngnRate?.rawBuyRate ?? ngnRate?.buyRate) || 0;
    const cryptoAmount = rawBuy > 0 ? obiexNgn / rawBuy : 0;
    return { cryptoAmount, rawRateNgnPerCoin: rawBuy, quoteSource: 'fiat_ngnx_usdt' };
  }

  const leg = await resolveObiexSwapLeg('NGNX', target, obiexNgn);
  const quoteRes = await obiexClient.createQuote({
    sourceId: leg.pairSource,
    targetId: leg.pairTarget,
    amount: leg.obiexAmount,
    side: leg.side,
  });
  const quote = unwrapData(quoteRes);
  const cryptoAmount = Number(quote?.amountReceived ?? 0);
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    throw ApiError.badRequest(`Could not quote ${target} buy right now. Please try again.`);
  }
  const rawRateNgnPerCoin = cryptoAmount > 0 ? obiexNgn / cryptoAmount : 0;
  return { cryptoAmount, rawRateNgnPerCoin, quoteSource: 'obiex_pair_quote' };
}

/**
 * Resolve how much NGN the user should pay for a buy.
 * When usdAmount is set (app "Amount in USD" field), convert via NGNX/USDT fiat
 * rate — never trust a client-computed NGN that used altcoin rates (e.g. TRX NGN
 * price ÷ TRX USD ≈ 3× inflation).
 */
async function resolveObiexBuyUserNgn(params: {
  sourceAmount?: string | number | null;
  usdAmount?: string | number | null;
}): Promise<{
  userNgn: number;
  usdNotional: number | null;
  ngnPerUsd: number;
  derivedFromUsd: boolean;
}> {
  const rates = await getAppObiexPublicRates();
  const ngnRate = rates.rates.find((r: any) => String(r.currency).toUpperCase() === 'NGNX');
  const ngnPerUsd = Number(ngnRate?.rawBuyRate ?? ngnRate?.buyRate) || 0;
  if (!(ngnPerUsd > 0)) {
    throw ApiError.badRequest('NGN rate unavailable. Please try again.');
  }

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  if (Number.isFinite(usdNotional) && usdNotional > 0) {
    return {
      userNgn: roundNgn(usdNotional * ngnPerUsd),
      usdNotional,
      ngnPerUsd,
      derivedFromUsd: true,
    };
  }

  const fromSource = parseFloat(String(params.sourceAmount ?? '').replace(/,/g, ''));
  if (!Number.isFinite(fromSource) || fromSource <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  return {
    userNgn: roundNgn(fromSource),
    usdNotional: null,
    ngnPerUsd,
    derivedFromUsd: false,
  };
}

async function estimateObiexSellToNgnx(
  sourceCurrency: string,
  sourceAmount: number
): Promise<{ obiexNgn: number; rawRateNgnPerCoin: number; quoteSource: string }> {
  const source = String(sourceCurrency || 'USDT').toUpperCase();
  if (isObiexUsdStable(source) && source !== 'NGNX' && source !== 'NGN') {
    const rates = await getAppObiexPublicRates();
    const ngnRate = rates.rates.find((r: any) => String(r.currency).toUpperCase() === 'NGNX');
    const rawSell = Number(ngnRate?.rawSellRate ?? ngnRate?.sellRate) || 0;
    const obiexNgn = roundNgn(sourceAmount * rawSell);
    return { obiexNgn, rawRateNgnPerCoin: rawSell, quoteSource: 'fiat_ngnx_usdt' };
  }

  const leg = await resolveObiexSwapLeg(source, 'NGNX', sourceAmount);
  const quoteRes = await obiexClient.createQuote({
    sourceId: leg.pairSource,
    targetId: leg.pairTarget,
    amount: leg.obiexAmount,
    side: leg.side,
  });
  const quote = unwrapData(quoteRes);
  const obiexNgn = roundNgn(Number(quote?.amountReceived ?? 0));
  if (!Number.isFinite(obiexNgn) || obiexNgn <= 0) {
    throw ApiError.badRequest(`Could not quote ${source} sell right now. Please try again.`);
  }
  const rawRateNgnPerCoin = sourceAmount > 0 ? obiexNgn / sourceAmount : 0;
  return { obiexNgn, rawRateNgnPerCoin, quoteSource: 'obiex_pair_quote' };
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
 * @param opts.receivableOnly — receive picker: only coins Obiex can issue a deposit address for.
 */
export async function getAppObiexAssets(
  userId: number,
  opts?: { receivableOnly?: boolean }
) {
  await assertObiexAppActive();

  const receivableOnly = !!opts?.receivableOnly;
  const status = await getAppObiexStatus(userId);
  const statusAssets: any[] = status.currencies?.assets || [];
  const statusByCode = new Map(
    statusAssets.map((a: any) => [String(a.code || '').toUpperCase(), a])
  );
  const receivableByCurrency: Record<string, string[]> =
    status.currencies?.networksReceivableByCurrency || {};

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
    if (isObiexCurrencyHidden(appCode) || isObiexCurrencyHidden(obiexCode)) continue;
    seenObiex.add(obiexCode);

    const meta = statusByCode.get(obiexCode) || statusByCode.get(appCode);
    const canDeposit = meta?.deposit === true;
    const canWithdraw = meta?.withdraw === true;

    // Drop coins Obiex cannot receive (no deposit address) when listing for Receive.
    if (receivableOnly) {
      if (!meta || !canDeposit) continue;
    }

    const receivableNets =
      receivableByCurrency[obiexCode] ||
      receivableByCurrency[appCode] ||
      (canDeposit ? meta?.networks : null) ||
      [];
    const netsFromMap = Array.isArray(row.networks) ? (row.networks as string[]) : null;
    const networksRaw: string[] = receivableOnly
      ? (receivableNets.length
          ? receivableNets
          : meta?.networks || [])
      : netsFromMap ||
        meta?.networks ||
        status.currencies?.networksByCurrency?.[obiexCode] ||
        [obiexCode];
    const networks = orderObiexNetworks(appCode, networksRaw);
    if (receivableOnly && networks.length === 0) continue;

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
      code: appCode,
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
      deposit: canDeposit,
      withdraw: canWithdraw,
      obiexCurrency: obiexCode,
      icon: getObiexIconPath(appCode) || getObiexIconPath(obiexCode),
      image: getObiexIconPath(appCode) || getObiexIconPath(obiexCode),
      source: 'obiex' as const,
    });
  }

  // Include any ledger balances not in the map (skip for receive — no deposit support).
  if (!receivableOnly) {
    for (const [code, ledger] of ledgerByCode.entries()) {
      if (seenObiex.has(code) || isObiexCurrencyHidden(code)) continue;
      seenObiex.add(code);
      const meta = statusByCode.get(code);
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
        code,
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
        deposit: meta?.deposit === true,
        withdraw: meta?.withdraw === true,
        obiexCurrency: code,
        icon: getObiexIconPath(code),
        image: getObiexIconPath(code),
        source: 'obiex' as const,
      });
    }
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
    receivableOnly,
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
  assertObiexCurrencyVisible(appCode);

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
  const appCode = String(currency).toUpperCase();
  const net = String(network).toUpperCase();
  if (!appCode || !net) throw ApiError.badRequest('currency and network required');
  assertObiexCurrencyVisible(appCode);

  const ledgerCode = await resolveObiexLedgerCurrency(appCode);
  const code = ledgerCode || appCode;

  // Reject coins/networks Obiex cannot receive (avoids opaque "Failed to load deposit address").
  try {
    const networksRes = await obiexClient.getActiveNetworks();
    const netMap = unwrapData(networksRes) || {};
    const entry = netMap[code] || netMap[appCode];
    const nets = Array.isArray(entry?.networks) ? entry.networks : [];
    const receivable = extractObiexNetworkCodes(nets, (n) => !!n?.isReceivable);
    if (!receivable.length) {
      throw ApiError.badRequest(
        `${appCode} deposits are not supported. Choose another asset.`
      );
    }
    if (!receivable.includes(net)) {
      throw ApiError.badRequest(
        `Network ${net} is not available for ${appCode} deposits. Try: ${receivable.join(', ')}`
      );
    }
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    console.warn('[Obiex deposit] network validation skipped', e?.message || e);
  }

  const existing = await depositModel().findUnique({
    where: { userId_currency_network: { userId, currency: code, network: net } },
  });
  if (existing?.address) {
    return {
      currency: appCode,
      network: net,
      address: existing.address,
      icon: getObiexIconPath(appCode),
    };
  }

  const uid = uniqueUserId(userId);
  let res: any;
  try {
    res = await obiexClient.createDepositAddress({
      uniqueUserIdentifier: uid,
      currency: code,
      network: net,
    });
  } catch (error: any) {
    if (error instanceof ObiexApiError) {
      const detail = Array.isArray((error.data as any)?.errors)
        ? (error.data as any).errors.map((e: any) => e?.message).filter(Boolean).join('; ')
        : '';
      const raw = String(detail || error.message || '')
        .replace(/\bObiex\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      throw ApiError.badRequest(
        raw || 'Could not generate a deposit address for this asset. Please try again.'
      );
    }
    throw error;
  }
  const data = unwrapData(res);
  // Obiex broker addresses use `value` (not `address`) — see POST /addresses/broker.
  const address =
    data?.value ||
    data?.address ||
    data?.walletAddress ||
    data?.depositAddress ||
    data?.data?.value ||
    data?.data?.address;
  if (!address) {
    throw ApiError.badRequest(
      'Could not generate a deposit address for this asset. Please try again.'
    );
  }

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
    currency: appCode,
    network: net,
    address: String(address),
    icon: getObiexIconPath(appCode),
  };
}

export async function previewAppObiexBuy(
  userId: number,
  params: { sourceAmount: string; targetCurrency: string; usdAmount?: string | number | null }
) {
  const settings = await assertObiexAppActive();
  const target = String(params.targetCurrency || 'USDT').toUpperCase();
  assertObiexCurrencyVisible(target);

  const ngnResolved = await resolveObiexBuyUserNgn(params);
  const userNgn = ngnResolved.userNgn;
  const usdNotional = ngnResolved.usdNotional;
  const resolved = await resolveObiexMarkupForUsdAmount(
    'buy',
    usdNotional && usdNotional > 0 ? usdNotional : userNgn / ngnResolved.ngnPerUsd
  );
  const flatFees = await getObiexFlatFeesNgn();
  const split = splitObiexBuyUserDebit({
    userNgn,
    buyMarkupPercent: resolved.percent,
    buyFlatFeeNgn: flatFees.buyFlatFeeNgn,
  });
  if (split.obiexNgn <= 0) throw ApiError.badRequest('Buy amount too small after fees');

  // Must quote the target asset — NGNX fiat rate is USDT-only, not TRX/BTC/etc.
  let estimate: { cryptoAmount: number; rawRateNgnPerCoin: number; quoteSource: string };
  try {
    estimate = await estimateObiexBuyFromNgnx(target, split.obiexNgn);
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (e instanceof ObiexApiError) throw ApiError.badRequest(e.message);
    throw e;
  }
  const rawBuy = estimate.rawRateNgnPerCoin;
  const markedBuyRate = applySignedRateMarkup(rawBuy, resolved.percent);
  const estimatedCrypto = estimate.cryptoAmount;

  return {
    buyMode: settings.buyMode,
    quote: {
      source_currency: 'NGN',
      target_currency: target,
      source_amount: formatAmountStr(userNgn, 2),
      target_amount: formatAmountStr(estimatedCrypto, 8),
      /** Marked-up NGN per 1 target coin (Obiex raw ± buy %). */
      rate: markedBuyRate,
      raw_rate: rawBuy,
      flat_fee_ngn: split.flatFeeNgn,
      amount_after_flat_fee_ngn: formatAmountStr(split.obiexNgn, 2),
      /** USD notional when client sent usdAmount — NGN was derived via USDT rate. */
      usd_amount:
        usdNotional && usdNotional > 0 ? formatAmountStr(usdNotional, 2) : null,
      ngn_per_usd: ngnResolved.ngnPerUsd,
      derived_from_usd: ngnResolved.derivedFromUsd,
    },
    markup: {
      buyMarkupPercent: resolved.percent,
      buyFlatFeeNgn: split.flatFeeNgn,
      markupSource: resolved.source,
      rangeId: resolved.rangeId ?? null,
      obiexSourceAmount: formatAmountStr(split.obiexNgn, 2),
      percentSpreadNgn: formatAmountStr(split.percentSpreadNgn, 2),
      platformSpreadNgn: formatAmountStr(split.grossPlatformProfitNgn, 2),
      quoteSource: estimate.quoteSource,
    },
  };
}

async function reverseBuyDebit(
  userId: number,
  fiatTxnId: string,
  amountNgn: number,
  reason: string
) {
  // Original debit txn is already "completed" — creditWallet would no-op.
  // Claim fail once, then credit via atomic helper + separate refund txn.
  try {
    const claimed = await prisma.fiatTransaction.updateMany({
      where: {
        id: fiatTxnId,
        status: { in: ['pending', 'completed', 'successful'] },
      },
      data: {
        status: 'failed',
        description: reason.slice(0, 500),
        errorMessage: reason.slice(0, 500),
      },
    });
    if (!claimed.count) {
      return; // already reversed / failed
    }
    const wallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    await fiatWalletService.creditWalletAtomic(wallet.id, amountNgn);
    await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId,
        walletId: wallet.id,
        type: 'CRYPTO_BUY_REFUND',
        status: 'completed',
        currency: 'NGN',
        amount: amountNgn,
        fees: 0,
        totalAmount: amountNgn,
        description: `Refund Obiex buy ${fiatTxnId.slice(0, 8)}`,
        metadata: JSON.stringify({ refundFor: fiatTxnId, reason: reason.slice(0, 300) }),
        completedAt: new Date(),
      },
    });
  } catch (e: any) {
    console.error('[Obiex buy] reverse debit failed', e?.message || e);
  }
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
  const target = String(params.targetCurrency || 'USDT').toUpperCase();
  assertObiexCurrencyVisible(target);

  // Prefer usdAmount → NGN via USDT rate so a bad client NGN (altcoin mis-convert) cannot over-debit.
  const ngnResolved = await resolveObiexBuyUserNgn(params);
  const userNgn = ngnResolved.userNgn;
  const usdNotional = ngnResolved.usdNotional;
  const resolved = await resolveObiexMarkupForUsdAmount(
    'buy',
    usdNotional && usdNotional > 0 ? usdNotional : userNgn / ngnResolved.ngnPerUsd
  );
  const flatFees = await getObiexFlatFeesNgn();
  const split = splitObiexBuyUserDebit({
    userNgn,
    buyMarkupPercent: resolved.percent,
    buyFlatFeeNgn: flatFees.buyFlatFeeNgn,
  });
  const obiexNgn = split.obiexNgn;
  const platformSpreadNgn = split.grossPlatformProfitNgn;
  if (obiexNgn <= 0) throw ApiError.badRequest('Buy amount too small after fees');

  const buyMarkupFields = {
    buyMarkupPercent: resolved.percent,
    buyFlatFeeNgn: split.flatFeeNgn,
    percentSpreadNgn: split.percentSpreadNgn,
    markupSource: resolved.source,
    rangeId: resolved.rangeId ?? null,
    userSourceAmount: formatAmountStr(userNgn, 2),
    obiexSourceAmount: formatAmountStr(obiexNgn, 2),
    platformSpreadNgn: formatAmountStr(platformSpreadNgn, 2),
    derivedFromUsd: ngnResolved.derivedFromUsd,
    usdAmount: usdNotional,
    ngnPerUsd: ngnResolved.ngnPerUsd,
    clientSourceAmount: params.sourceAmount ?? null,
  };

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
          markup: buyMarkupFields,
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
  const balance = parseFloat(String(fiatWallet.balance).replace(/,/g, ''));
  if (!(Number.isFinite(balance) && balance + 1e-9 >= userNgn)) {
    throw ApiError.badRequest(
      `Insufficient NGN wallet balance (have ₦${Number.isFinite(balance) ? balance.toFixed(2) : '0'}, need ₦${userNgn.toFixed(2)})`
    );
  }

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
        markup: buyMarkupFields,
      },
    },
  });

  let cryptoCredited = false;
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
    let providerDepositFeeNgn = 0;
    if (!skipVaFund) {
      const funding = await fundObiexNgnxViaPalmpayForBuy({
        creditNeededNgn: obiexNgn,
        tradeId: trade.id,
        userId,
      });
      fundingAdminNote = funding.adminNote;
      providerDepositFeeNgn = roundNgn(Number(funding.feeNgn) || 0);
      await tradeModel().update({
        where: { id: trade.id },
        data: {
          providerResponse: {
            buyMode: 'master_swap',
            funding: fundingAdminNote,
            markup: buyMarkupFields,
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

    // Obiex pairs are oriented as CRYPTO/NGNX (e.g. USDT/NGNX). Spending NGNX
    // for crypto is BUY on that pair — not NGNX→USDT SELL (pair does not exist).
    const buyLeg = await resolveObiexSwapLeg('NGNX', ledgerCurrency, obiexNgn);
    const swap = await obiexClient.instantSwap({
      sourceId: buyLeg.pairSource,
      targetId: buyLeg.pairTarget,
      amount: buyLeg.obiexAmount,
      side: buyLeg.side,
    });
    const swapData = unwrapData(swap);
    const received = Number(swapData?.amountReceived ?? swapData?.targetAmount ?? 0);
    if (!Number.isFinite(received) || received <= 0) {
      throw ApiError.badRequest('Obiex swap returned no crypto amount');
    }

    await creditObiexAsset(userId, ledgerCurrency, received);
    cryptoCredited = true;
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

    const feesForAdmin = buildObiexFeesForAdmin({
      side: 'buy',
      markupPercent: resolved.percent,
      flatFeeNgn: split.flatFeeNgn,
      percentSpreadNgn: split.percentSpreadNgn,
      grossPlatformProfitNgn: platformSpreadNgn,
      providerFeesNgn: providerDepositFeeNgn,
      userNgn,
      obiexNgn,
      extra: {
        obiexNgnDepositFeeNgn: providerDepositFeeNgn,
      },
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
          feesForAdmin,
          markup: buyMarkupFields,
        },
      },
    });

    try {
      await prisma.fiatTransaction.update({
        where: { id: fiatTxn.id },
        data: {
          metadata: JSON.stringify({
            adminOnly: true,
            feesForAdmin,
            ...(fundingAdminNote ? { obiexNgnDepositFunding: fundingAdminNote } : {}),
          }),
        },
      });
    } catch {
      /* best-effort */
    }

    // User-facing payload stays a normal completed buy (no funding / VA details).
    return { trade: updated };
  } catch (error: any) {
    // If user already got crypto, do NOT reverse NGN (would double-pay). Flag for recon.
    if (!cryptoCredited) {
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
    } else {
      console.error(
        `[Obiex buy] post-credit failure for trade ${trade.id} user ${userId}; NGN not reversed (crypto already credited):`,
        error?.message || error
      );
      await tradeModel()
        .update({
          where: { id: trade.id },
          data: {
            status: 'completed',
            errorMessage: `Post-credit issue (manual recon): ${String(error?.message || error).slice(0, 400)}`,
          },
        })
        .catch(() => undefined);
    }
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
  assertObiexCurrencyVisible(source);
  const available = await getObiexAvailable(userId, source);
  if (available + 1e-12 < amount) throw ApiError.badRequest(`Insufficient ${source}`);

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'sell',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : amount
  );

  let sellEst: { obiexNgn: number; rawRateNgnPerCoin: number; quoteSource: string };
  try {
    sellEst = await estimateObiexSellToNgnx(source, amount);
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (e instanceof ObiexApiError) throw ApiError.badRequest(e.message);
    throw e;
  }
  const rawSell = sellEst.rawRateNgnPerCoin;
  const markedSellRate = applySignedRateMarkup(rawSell, resolved.percent);
  const obiexNgn = sellEst.obiexNgn;
  const flatFees = await getObiexFlatFeesNgn();
  const split = splitObiexSellUserCredit({
    obiexNgn,
    sellMarkupPercent: resolved.percent,
    sellFlatFeeNgn: flatFees.sellFlatFeeNgn,
  });

  return {
    quote: {
      source_currency: source,
      target_currency: 'NGN',
      source_amount: formatAmountStr(amount, 8),
      target_amount: formatAmountStr(split.userNgn, 2),
      /** Marked-up NGN per 1 source coin (Obiex raw ± sell %). Flat fee is separate. */
      rate: markedSellRate,
      raw_rate: rawSell,
      flat_fee_ngn: split.flatFeeNgn,
      /** NGN after % rate adjust, before flat fee. */
      amount_before_flat_fee_ngn: formatAmountStr(roundNgn(split.userNgn + split.flatFeeNgn), 2),
    },
    markup: {
      sellMarkupPercent: resolved.percent,
      sellFlatFeeNgn: split.flatFeeNgn,
      markupSource: resolved.source,
      obiexTargetAmount: formatAmountStr(obiexNgn, 2),
      percentSpreadNgn: formatAmountStr(split.percentSpreadNgn, 2),
      platformSpreadNgn: formatAmountStr(split.grossPlatformProfitNgn, 2),
      userCreditNgn: formatAmountStr(split.userNgn, 2),
      quoteSource: sellEst.quoteSource,
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
  assertObiexCurrencyVisible(sourceRaw);
  const source = await resolveObiexLedgerCurrency(sourceRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  let resolved = await resolveObiexMarkupForUsdAmount(
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

  let ngnCredited = false;
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
    // Re-tier markup from actual Obiex NGN when client usdAmount was missing/stale.
    if (!(Number.isFinite(usdNotional) && usdNotional > 0) && obiexNgn > 0) {
      resolved = await resolveObiexMarkupForUsdAmount('sell', obiexNgn / 1500);
    }
    const flatFees = await getObiexFlatFeesNgn();
    const split = splitObiexSellUserCredit({
      obiexNgn,
      sellMarkupPercent: resolved.percent,
      sellFlatFeeNgn: flatFees.sellFlatFeeNgn,
    });
    const userNgn = split.userNgn;
    const sellMarkupFeeNgn = split.grossPlatformProfitNgn;

    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const fiatTxn = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId,
        walletId: fiatWallet.id,
        type: 'CRYPTO_SELL',
        status: 'pending',
        currency: 'NGN',
        amount: userNgn,
        /** User-facing flat+% fee only — Obiex withdraw fee is admin-only in metadata. */
        fees: sellMarkupFeeNgn,
        totalAmount: userNgn,
        description: `Obiex sell ${source}`,
      },
    });
    await fiatWalletService.creditWallet(fiatWallet.id, userNgn, fiatTxn.id);
    ngnCredited = true;

    // Move Obiex NGNX proceeds to PalmPay business account (admin settlement).
    // User already credited — settlement failure is logged, sell stays completed.
    const settlement = await settleObiexSellNgnxToBusinessAccount({
      amountNgn: obiexNgn,
      tradeId: trade.id,
      userId,
      sourceCurrency: source,
    });
    const feesForAdmin = buildObiexFeesForAdmin({
      side: 'sell',
      markupPercent: resolved.percent,
      flatFeeNgn: split.flatFeeNgn,
      percentSpreadNgn: split.percentSpreadNgn,
      grossPlatformProfitNgn: sellMarkupFeeNgn,
      providerFeesNgn: settlement.providerWithdrawFeeNgn,
      userNgn,
      obiexNgn,
      extra: {
        obiexFiatWithdrawFeeNgn: settlement.providerWithdrawFeeNgn,
        netSettledToBusinessNgn: settlement.netSettledToBusinessNgn,
        settlementStatus: settlement.status,
      },
    });

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
          settlement: settlement.adminNote,
          feesForAdmin,
          markup: {
            sellMarkupPercent: resolved.percent,
            sellFlatFeeNgn: split.flatFeeNgn,
            percentSpreadNgn: split.percentSpreadNgn,
            markupSource: resolved.source,
            obiexTargetAmount: formatAmountStr(obiexNgn, 2),
            platformSpreadNgn: formatAmountStr(sellMarkupFeeNgn, 2),
            userCreditNgn: formatAmountStr(userNgn, 2),
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
            feesForAdmin,
            obiexSellSettlement: settlement.adminNote,
          }),
        },
      });
    } catch {
      /* best-effort */
    }

    return { trade: updated };
  } catch (error: any) {
    // If user already got NGN, do NOT refund crypto (would double-pay). Flag for recon.
    if (!ngnCredited) {
      await creditObiexAsset(userId, source, amount).catch(() => undefined);
      await tradeModel()
        .update({
          where: { id: trade.id },
          data: {
            status: 'failed',
            errorMessage: error?.message || 'Obiex sell failed',
          },
        })
        .catch(() => undefined);
    } else {
      console.error(
        '[Obiex sell] failed after NGN credit — leaving crypto debited; needs recon',
        trade.id,
        error?.message || error
      );
      await tradeModel()
        .update({
          where: { id: trade.id },
          data: {
            status: 'needs_recon',
            errorMessage: `Post-credit failure: ${error?.message || 'Obiex sell failed'}`.slice(
              0,
              500
            ),
          },
        })
        .catch(() => undefined);
    }
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
  assertObiexCurrencyVisible(source);
  assertObiexCurrencyVisible(target);
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
  assertObiexCurrencyVisible(String(params.sourceCurrency || ''));
  assertObiexCurrencyVisible(String(params.targetCurrency || ''));
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
  assertObiexCurrencyVisible(currency);
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
  assertObiexCurrencyVisible(String(params.currency || ''));
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

  let withdrawAccepted = false;
  try {
    const res = await obiexClient.withdrawCrypto({
      currency,
      amount,
      destination: { address, network },
    });
    const data = unwrapData(res);
    withdrawAccepted = true;

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
    // Only refund ledger if Obiex never accepted the withdraw (otherwise double-pay on chain)
    if (!withdrawAccepted) {
      await creditObiexAsset(userId, currency, totalDebit).catch(() => undefined);
      await tradeModel().update({
        where: { id: trade.id },
        data: {
          status: 'failed',
          errorMessage: error?.message || 'Obiex withdraw failed',
        },
      });
    } else {
      console.error(
        '[Obiex send] provider accepted withdraw but local finalize failed — needs recon',
        trade.id,
        error?.message || error
      );
      await tradeModel().update({
        where: { id: trade.id },
        data: {
          status: 'needs_recon',
          errorMessage: `Post-withdraw failure: ${error?.message || 'unknown'}`.slice(0, 500),
        },
      });
    }
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
