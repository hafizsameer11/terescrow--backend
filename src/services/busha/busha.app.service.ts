import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  assertBushaAppActive,
  getSellPayoutMode,
  previewBushaQuote,
  prepareBushaSellPalmpayPayout,
  executeBushaSell,
  executeBushaBuy,
  executeBushaCryptoReceive,
  executeBushaCryptoSend,
  previewBushaCryptoSend,
  executeBushaConvert,
  previewBushaConvertQuote,
  getBushaCustomerWallet,
  getBushaCustomerDepositAddress,
  regenerateBushaCustomerDepositAddress,
  getBushaCurrencyNetworkLimits,
  refreshBushaCustomer,
  submitBushaCustomerKyc,
  verifyBushaCustomer,
  createDashboardBankRecipientOnProfile,
  getBushaTrade,
  refreshBushaTrade,
  getBushaConfigRow,
} from './busha.trade.service';
import {
  resolveBushaNetwork,
  getBushaCurrenciesForAdmin,
  BUSHA_CRYPTO_ASSETS,
  getBushaCryptoAsset,
  withBushaIcon,
} from './busha.currencies';
import { getBushaIconPath } from './busha.icons';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { settleBushaTradeIfNeeded } from './busha.settlement.service';
import { bushaConfig } from './busha.config';
import {
  assertBushaBuyNgnWithinLimits,
  assertBushaSellCryptoWithinLimits,
  getBushaNgnPairLimitsByCurrency,
} from './busha.pairs.service';
import {
  bushaBuySourceNgn,
  formatAmountStr,
  getBushaMarkupPercents,
  roundNgn,
  userSellCreditNgn,
} from './busha.markup';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;

async function getCurrenciesWithPairLimits() {
  const base = getBushaCurrenciesForAdmin();
  try {
    const limitsByCode = await getBushaNgnPairLimitsByCurrency();
    return {
      ...base,
      assets: base.assets.map((asset) => {
        const limits = limitsByCode[asset.code];
        if (!limits) return asset;
        return {
          ...asset,
          minBuyNgn: limits.minBuyNgn,
          maxBuyNgn: limits.maxBuyNgn,
          minSellCrypto: limits.minSellCrypto,
          maxSellCrypto: limits.maxSellCrypto,
          minSellNgn: limits.minSellNgn,
          maxSellNgn: limits.maxSellNgn,
        };
      }),
      pairLimits: limitsByCode,
    };
  } catch {
    return base;
  }
}

export async function getBushaAppPublicStatus() {
  const configured = bushaConfig.isConfigured();
  const settings = await getBushaConfigRow();
  return {
    configured,
    isActive: !!(configured && settings?.isActive),
    sellPayoutMode: (settings?.sellPayoutMode || 'palmpay_temp') as string,
    buyMarkupPercent: Number((settings as any)?.buyMarkupPercent ?? 0),
    sellMarkupPercent: Number((settings as any)?.sellMarkupPercent ?? 0),
    currencies: await getCurrenciesWithPairLimits(),
  };
}

export async function getBushaAppStatusForUser(userId: number) {
  const base = await getBushaAppPublicStatus();
  if (!base.isActive) {
    return {
      ...base,
      needsKyc: false,
      canTrade: false,
      kycStatus: 'inactive_platform',
      kyc: null,
    };
  }
  const { getBushaKycStatusForUser } = await import('./busha.kyc.service');
  const kyc = await getBushaKycStatusForUser(userId);
  return {
    ...base,
    needsKyc: kyc.needsKyc,
    canTrade: kyc.canTrade,
    kycStatus: kyc.kycStatus,
    needsTerescrowKyc: kyc.needsTerescrowKyc,
    terescrowKycReady: kyc.terescrowKycReady,
    canActivateCrypto: kyc.canActivateCrypto,
    kyc,
  };
}

export async function ensureBushaCustomerForUser(userId: number) {
  await assertBushaAppActive();

  const existing = await bushaCustomerModel.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  throw ApiError.badRequest(
    'Complete Busha crypto KYC first (legal name, date of birth, NIN, and selfie) before using crypto.'
  );
}

export async function getAppBushaProfile(userId: number) {
  await assertBushaAppActive();
  const { getBushaKycStatusForUser } = await import('./busha.kyc.service');
  const kyc = await getBushaKycStatusForUser(userId);

  if (!kyc.customer) {
    return {
      customer: null,
      bushaRemote: null,
      ready: { active: false, deposit: false, payout: false },
      currencies: getBushaCurrenciesForAdmin(),
      kyc,
    };
  }

  const refreshed = await refreshBushaCustomer(kyc.customer.id);
  const remote = refreshed.providerData || {};
  return {
    customer: refreshed,
    bushaRemote: remote,
    ready: {
      active: String(refreshed.status).toLowerCase() === 'active',
      deposit: !!(remote as any).deposit,
      payout: !!(remote as any).payout,
    },
    currencies: getBushaCurrenciesForAdmin(),
    kyc,
  };
}

export async function submitAppBushaKyc(
  userId: number,
  input: {
    documentType: 'national-id' | 'passport' | 'drivers-license';
    documentNumber: string;
    selfieBase64: string;
    documentImageBase64?: string;
    birthDate?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  return submitBushaCustomerKyc(customer.id, input);
}

export async function verifyAppBushaKyc(
  userId: number,
  input?: {
    documentType: 'national-id' | 'passport' | 'drivers-license';
    documentNumber: string;
    selfieBase64: string;
    documentImageBase64?: string;
    birthDate?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  if (input?.documentType && input.documentNumber && input.selfieBase64) {
    await submitBushaCustomerKyc(customer.id, input);
  }
  return verifyBushaCustomer(customer.id, input as any);
}

async function assertCustomerTradeReady(customerId: string, needPayout = false) {
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');
  const status = String(customer.status || '').toLowerCase();
  if (status !== 'active' && status !== 'in_review') {
    // still allow in_review for some ops? Plan says gate until active
  }
  if (status !== 'active') {
    throw ApiError.badRequest(
      `Busha profile is "${customer.status}". Complete KYC and wait until status is active before trading.`
    );
  }
  const remote = (customer.providerData || {}) as any;
  if (needPayout && remote.payout === false) {
    throw ApiError.badRequest('Busha payout is not enabled on this profile yet.');
  }
  if (remote.deposit === false && needPayout === false) {
    // deposit flag mainly for receive
  }
  return customer;
}

export async function getAppBushaWallet(userId: number, currency?: string) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  return getBushaCustomerWallet(customer.id, currency);
}

/** Reusable deposit address — preferred receive path (no amount). */
export async function getAppBushaDepositAddress(
  userId: number,
  currency: string,
  network?: string
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);
  return getBushaCustomerDepositAddress(customer.id, currency, network);
}

export async function regenerateAppBushaDepositAddress(
  userId: number,
  currency: string,
  network?: string
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);
  return regenerateBushaCustomerDepositAddress(customer.id, currency, network);
}

/** Normalized crypto assets for mobile (Busha balances + supported currency catalog). */
export async function getAppBushaAssets(userId: number) {
  await assertBushaAppActive();

  const catalog = BUSHA_CRYPTO_ASSETS;

  let balances: any[] = [];
  const customer = await bushaCustomerModel.findUnique({ where: { userId } });
  if (customer) {
    try {
      const wallet = await getBushaCustomerWallet(customer.id);
      balances = wallet.balances || [];
    } catch {
      balances = [];
    }
  }

  const balanceByCurrency = new Map<string, any>();
  for (const b of balances) {
    const code = String(b.currency || '').toUpperCase();
    if (!code) continue;
    if (String(b.type || '').toLowerCase() === 'fiat') continue;
    balanceByCurrency.set(code, b);
  }

  const readAmount = (bal: any): string => {
    if (!bal) return '0';
    const raw =
      bal?.available?.amount ??
      bal?.available ??
      bal?.total?.amount ??
      bal?.total ??
      '0';
    const n = parseFloat(String(raw).replace(/,/g, ''));
    return Number.isFinite(n) ? String(n) : '0';
  };

  const assets = catalog.map((asset, index) => {
    const bal = balanceByCurrency.get(asset.code);
    const available = readAmount(bal);
    return withBushaIcon({
      id: -(index + 1),
      currency: asset.code,
      blockchain: asset.defaultNetwork,
      symbol: getBushaIconPath(asset.code) || asset.code,
      name: asset.name,
      balance: available,
      availableBalance: available,
      balanceUsd: '0',
      balanceNaira: '0',
      price: '0',
      nairaPrice: '0',
      depositAddress: '',
      active: true,
      frozen: false,
      networks: asset.networks,
      defaultNetwork: asset.defaultNetwork,
      source: 'busha' as const,
    }, asset.code);
  });

  // Include any unexpected Busha crypto balances not in catalog
  for (const [code, bal] of balanceByCurrency.entries()) {
    if (getBushaCryptoAsset(code)) continue;
    const available = readAmount(bal);
    assets.push(withBushaIcon({
      id: -(assets.length + 1),
      currency: code,
      blockchain: code,
      symbol: getBushaIconPath(code) || code,
      name: code,
      balance: available,
      availableBalance: available,
      balanceUsd: '0',
      balanceNaira: '0',
      price: '0',
      nairaPrice: '0',
      depositAddress: '',
      active: true,
      frozen: false,
      networks: [code],
      defaultNetwork: code,
      source: 'busha' as const,
    }, code));
  }

  let totalUsd = 0;
  for (const a of assets) {
    const amt = parseFloat(a.balance || '0');
    // Stablecoins ≈ 1 USD; others filled by client CMC quotes
    if (['USDT', 'USDC', 'USD'].includes(a.currency)) {
      totalUsd += Number.isFinite(amt) ? amt : 0;
      a.balanceUsd = String(Number.isFinite(amt) ? amt : 0);
    }
  }

  return {
    assets,
    totals: {
      totalUsd: String(totalUsd),
      totalNaira: '0',
    },
    count: assets.length,
    source: 'busha' as const,
  };
}

export async function getAppBushaAssetDetail(userId: number, currency: string) {
  await assertBushaAppActive();
  const code = currency.toUpperCase();
  const meta = getBushaCryptoAsset(code);
  const assets = await getAppBushaAssets(userId);
  const asset = assets.assets.find((a) => a.currency === code);
  if (!asset && !meta) {
    throw ApiError.notFound(`Asset ${code} not found`);
  }

  const row = withBushaIcon(asset || {
    id: -1,
    currency: code,
    blockchain: meta?.defaultNetwork || code,
    symbol: getBushaIconPath(code) || code,
    name: meta?.name || code,
    balance: '0',
    availableBalance: '0',
    balanceUsd: '0',
    balanceNaira: '0',
    price: '0',
    nairaPrice: '0',
    depositAddress: '',
    active: true,
    frozen: false,
    networks: meta?.networks || [code],
    defaultNetwork: meta?.defaultNetwork || code,
    source: 'busha' as const,
  }, code);

  const trades = await bushaTradeLogModel.findMany({
    where: {
      userId,
      OR: [{ sourceCurrency: code }, { targetCurrency: code }],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return {
    ...row,
    accountCode: code,
    accountId: code,
    availableBalance: row.availableBalance || row.balance,
    accountBalance: row.availableBalance || row.balance,
    availableBalanceUsd: row.balanceUsd,
    accountBalanceUsd: row.balanceUsd,
    availableBalanceNaira: row.balanceNaira,
    accountBalanceNaira: row.balanceNaira,
    transactions: trades.map((t: any) => ({
      id: t.id,
      transactionId: t.id,
      transactionType: mapBushaSideToTxType(t.side),
      type: mapBushaSideToTxType(t.side),
      cryptocurrencyType: t.side === 'convert' ? `${t.sourceCurrency}→${t.targetCurrency}` : t.sourceCurrency,
      currency: t.sourceCurrency,
      amount: t.sourceAmount,
      amountUsd: t.targetAmount || '0',
      status: t.status,
      createdAt: t.createdAt,
      symbol: getBushaIconPath(t.sourceCurrency) || t.sourceCurrency,
      iconUrl: getBushaIconPath(t.sourceCurrency),
    })),
    source: 'busha' as const,
  };
}

function mapBushaSideToTxType(side: string): string {
  const s = String(side || '').toLowerCase();
  if (s === 'buy') return 'BUY';
  if (s === 'sell') return 'SELL';
  if (s === 'cryptorecv' || s === 'receive') return 'RECEIVE';
  if (s === 'cryptosend' || s === 'send') return 'SEND';
  if (s === 'convert' || s === 'swap') return 'SWAP';
  return s.toUpperCase();
}

export async function previewAppBushaConvert(
  userId: number,
  params: {
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmount: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const wallet = await getBushaCustomerWallet(customer.id, params.sourceCurrency.toUpperCase());
  const bal = wallet.balances.find(
    (b: any) => String(b.currency || '').toUpperCase() === params.sourceCurrency.toUpperCase()
  );
  const available = parseFloat(bal?.available?.amount || '0');
  const amount = parseFloat(params.sourceAmount);

  const { quote } = await previewBushaConvertQuote({
    customerId: customer.id,
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    amount: params.sourceAmount,
  });

  return {
    quote,
    available: String(available),
    sufficient: Number.isFinite(amount) && amount > 0 && available >= amount,
    sourceCurrency: params.sourceCurrency.toUpperCase(),
    targetCurrency: params.targetCurrency.toUpperCase(),
    sourceAmount: params.sourceAmount,
    targetAmount: (quote as any).target_amount || null,
    rate: (quote as any).rate || null,
    fees: (quote as any).fees || [],
    expiresAt: (quote as any).expires_at || null,
    canProceed: Number.isFinite(amount) && amount > 0 && available >= amount,
    hasSufficientBalance: Number.isFinite(amount) && amount > 0 && available >= amount,
    // Legacy swap-UI aliases (mobile expects from*/to*/gas*/total*)
    fromCurrency: params.sourceCurrency.toUpperCase(),
    toCurrency: params.targetCurrency.toUpperCase(),
    fromAmount: String(params.sourceAmount),
    toAmount: String((quote as any).target_amount || '0'),
    fromBlockchain: params.sourceCurrency.toUpperCase(),
    toBlockchain: params.targetCurrency.toUpperCase(),
    fromAmountUsd: null,
    toAmountUsd: null,
    gasFee: '0',
    gasFeeUsd: '0',
    totalAmount: String(params.sourceAmount),
    totalAmountUsd: null,
    rateDisplay:
      typeof (quote as any).rate === 'object' && (quote as any).rate?.rate != null
        ? String((quote as any).rate.rate)
        : (quote as any).rate != null
          ? String((quote as any).rate)
          : null,
  };
}

export async function executeAppBushaConvert(
  userId: number,
  params: {
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmount: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const preview = await previewAppBushaConvert(userId, params);
  if (!preview.hasSufficientBalance) {
    throw ApiError.badRequest('Insufficient Busha balance for this convert');
  }

  const trade = await executeBushaConvert({
    adminUserId: userId,
    customerId: customer.id,
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    sourceAmount: params.sourceAmount,
  });

  const updated = await bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { userId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  await settleBushaTradeIfNeeded(updated.id);
  return getBushaTrade(updated.id);
}

export async function previewAppBushaSell(
  userId: number,
  params: {
    sourceCurrency: string;
    sourceAmount: string;
    fundingMethod?: 'balance' | 'address';
    network?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);

  const cryptoAmount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  await assertBushaSellCryptoWithinLimits(params.sourceCurrency, cryptoAmount);

  const sellPayoutMode = await getSellPayoutMode();
  const { sellMarkupPercent } = await getBushaMarkupPercents();

  const quote = await previewBushaQuote({
    customerId: customer.id,
    side: 'sell',
    sourceCurrency: params.sourceCurrency,
    targetCurrency: 'NGN',
    amount: params.sourceAmount,
    fundingMethod: params.fundingMethod || 'balance',
    network: params.network,
    payoutToBalance: true,
  });

  const bushaNgn = parseFloat(String(quote.quote?.target_amount || '0').replace(/,/g, '')) || 0;
  const userNgn = roundNgn(userSellCreditNgn(bushaNgn, sellMarkupPercent));
  const userFacingQuote = {
    ...quote.quote,
    target_amount: formatAmountStr(userNgn, 2),
  };

  return {
    quote: userFacingQuote,
    bushaQuote: quote.quote,
    customer: quote.customer,
    sellPayoutMode,
    markup: {
      sellMarkupPercent,
      bushaTargetAmount: formatAmountStr(bushaNgn, 2),
      userTargetAmount: formatAmountStr(userNgn, 2),
      platformSpreadNgn: formatAmountStr(roundNgn(bushaNgn - userNgn), 2),
    },
    note:
      sellPayoutMode === 'palmpay_temp'
        ? 'NGN settles to PalmPay temp account; your Terescrow NGN wallet is credited when Busha completes.'
        : 'NGN settles to the admin dashboard bank; your Terescrow NGN wallet is credited when Busha completes.',
  };
}

export async function executeAppBushaSell(
  userId: number,
  params: {
    sourceCurrency: string;
    sourceAmount: string;
    fundingMethod?: 'balance' | 'address';
    network?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);

  const cryptoAmount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  await assertBushaSellCryptoWithinLimits(params.sourceCurrency, cryptoAmount);

  const sellPayoutMode = await getSellPayoutMode();
  const settings = await getBushaConfigRow();

  let payoutRecipientId: string | undefined;
  let palmpayPayoutOrderId: string | undefined;
  let palmpayPayoutOrderNo: string | undefined;
  let prepareMeta: any = null;

  if (sellPayoutMode === 'palmpay_temp') {
    const prepared = await prepareBushaSellPalmpayPayout({
      adminUserId: userId,
      customerId: customer.id,
      sourceCurrency: params.sourceCurrency,
      targetCurrency: 'NGN',
      sourceAmount: params.sourceAmount,
      fundingMethod: params.fundingMethod || 'balance',
      network: params.network,
    });
    payoutRecipientId = prepared.bushaRecipient.id;
    palmpayPayoutOrderId = prepared.palmpay.merchantOrderId;
    palmpayPayoutOrderNo = prepared.palmpay.orderNo;
    prepareMeta = prepared;
  } else {
    if (!settings?.payoutBankCode || !settings?.payoutAccountNumber || !settings?.payoutAccountName) {
      throw ApiError.badRequest('Admin dashboard payout bank is not configured.');
    }
    // Recipient must exist on this user's Busha profile
    const synced = await createDashboardBankRecipientOnProfile(customer.bushaProfileId);
    payoutRecipientId = synced.recipient.id;
  }

  const trade = await executeBushaSell({
    adminUserId: userId,
    customerId: customer.id,
    sourceCurrency: params.sourceCurrency,
    targetCurrency: 'NGN',
    sourceAmount: params.sourceAmount,
    fundingMethod: params.fundingMethod || 'balance',
    network: params.network,
    payoutRecipientId,
    palmpayPayoutOrderId,
    palmpayPayoutOrderNo,
  });

  const { sellMarkupPercent } = await getBushaMarkupPercents();
  const bushaNgn = parseFloat(String(trade.targetAmount || '0')) || 0;
  const userNgn = roundNgn(userSellCreditNgn(bushaNgn, sellMarkupPercent));

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
      fees: roundNgn(bushaNgn - userNgn),
      totalAmount: userNgn,
      description: `Busha sell ${params.sourceAmount} ${params.sourceCurrency.toUpperCase()}`,
      palmpayOrderId: palmpayPayoutOrderId || null,
      palmpayOrderNo: palmpayPayoutOrderNo || null,
    },
  });

  const updated = await bushaTradeLogModel.update({
    where: { id: trade.id },
    data: {
      userId,
      payoutMode: sellPayoutMode,
      fiatTransactionId: fiatTxn.id,
      status: trade.status === 'awaiting_crypto_deposit' ? 'awaiting_crypto_deposit' : 'settling',
      providerResponse: {
        ...(trade.providerResponse as object),
        prepare: prepareMeta,
        sellPayoutMode,
        markup: {
          sellMarkupPercent,
          bushaTargetAmount: formatAmountStr(bushaNgn, 2),
          userCreditNgn: formatAmountStr(userNgn, 2),
          platformSpreadNgn: formatAmountStr(roundNgn(bushaNgn - userNgn), 2),
        },
      } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  // Try immediate settlement if already complete
  await settleBushaTradeIfNeeded(updated.id);

  return getBushaTrade(updated.id);
}

export async function executeAppBushaBuy(
  userId: number,
  params: {
    sourceAmount: string;
    targetCurrency: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const amountNgn = parseFloat(params.sourceAmount);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  await assertBushaBuyNgnWithinLimits(params.targetCurrency, amountNgn);

  const { buyMarkupPercent } = await getBushaMarkupPercents();
  const bushaNgn = roundNgn(bushaBuySourceNgn(amountNgn, buyMarkupPercent));
  if (bushaNgn <= 0) {
    throw ApiError.badRequest('Buy amount too small after markup');
  }
  const platformSpreadNgn = roundNgn(amountNgn - bushaNgn);

  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const balance = parseFloat(String(fiatWallet.balance));
  if (balance < amountNgn) {
    throw ApiError.badRequest('Insufficient NGN wallet balance');
  }

  const fiatTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: fiatWallet.id,
      type: 'CRYPTO_BUY',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: platformSpreadNgn,
      totalAmount: amountNgn,
      description: `Busha buy ${params.targetCurrency.toUpperCase()}`,
    },
  });

  try {
    await fiatWalletService.debitWallet(fiatWallet.id, amountNgn, fiatTxn.id);
  } catch (error: any) {
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: { status: 'failed' },
    });
    throw ApiError.badRequest(error?.message || 'Failed to debit NGN wallet');
  }

  try {
    const trade = await executeBushaBuy({
      adminUserId: userId,
      customerId: customer.id,
      sourceCurrency: 'NGN',
      targetCurrency: params.targetCurrency,
      sourceAmount: formatAmountStr(bushaNgn, 2),
      autoPalmpayPayout: true,
    });

    const updated = await bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        userId,
        fiatTransactionId: fiatTxn.id,
        status: trade.status === 'palmpay_failed' ? 'palmpay_failed' : 'settling',
        providerResponse: {
          ...(trade.providerResponse as object),
          fiatDebitTransactionId: fiatTxn.id,
          markup: {
            buyMarkupPercent,
            userSourceAmount: formatAmountStr(amountNgn, 2),
            bushaSourceAmount: formatAmountStr(bushaNgn, 2),
            platformSpreadNgn: formatAmountStr(platformSpreadNgn, 2),
          },
        } as any,
      },
      include: {
        customer: true,
        initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    });

    if (updated.status === 'palmpay_failed') {
      await reverseBuyDebit(userId, fiatTxn.id, amountNgn, 'Busha buy PalmPay failed');
    } else {
      await settleBushaTradeIfNeeded(updated.id);
    }

    return getBushaTrade(updated.id);
  } catch (error: any) {
    await reverseBuyDebit(userId, fiatTxn.id, amountNgn, error?.message || 'Busha buy failed');
    throw error;
  }
}

/** App buy preview — applies buy markup % on Busha's live rate. */
export async function previewAppBushaBuy(
  userId: number,
  params: { sourceAmount: string; targetCurrency: string }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const userNgn = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(userNgn) || userNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  await assertBushaBuyNgnWithinLimits(params.targetCurrency, userNgn);

  const { buyMarkupPercent } = await getBushaMarkupPercents();
  const bushaNgn = roundNgn(bushaBuySourceNgn(userNgn, buyMarkupPercent));
  if (bushaNgn <= 0) {
    throw ApiError.badRequest('Buy amount too small after markup');
  }

  const data = await previewBushaQuote({
    customerId: customer.id,
    side: 'buy',
    sourceCurrency: 'NGN',
    targetCurrency: params.targetCurrency,
    amount: formatAmountStr(bushaNgn, 2),
    fundingMethod: 'temporary_bank_account',
  });

  const userFacingQuote = {
    ...data.quote,
    source_amount: formatAmountStr(userNgn, 2),
  };

  return {
    ...data,
    quote: userFacingQuote,
    bushaQuote: data.quote,
    markup: {
      buyMarkupPercent,
      userSourceAmount: formatAmountStr(userNgn, 2),
      bushaSourceAmount: formatAmountStr(bushaNgn, 2),
      platformSpreadNgn: formatAmountStr(roundNgn(userNgn - bushaNgn), 2),
    },
  };
}

async function reverseBuyDebit(userId: number, originalTxnId: string, amountNgn: number, reason: string) {
  const wallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const refundTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: wallet.id,
      type: 'CRYPTO_BUY_REFUND',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: reason,
    },
  });
  await fiatWalletService.creditWallet(wallet.id, amountNgn, refundTxn.id);
  await prisma.fiatTransaction.update({
    where: { id: originalTxnId },
    data: { status: 'failed', description: reason },
  });
}

export async function executeAppBushaReceive(
  userId: number,
  params: { currency: string; amount: string; network?: string }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const trade = await executeBushaCryptoReceive({
    adminUserId: userId,
    customerId: customer.id,
    currency: params.currency,
    amount: params.amount,
    network: params.network,
  });

  return bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { userId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function executeAppBushaSend(
  userId: number,
  params: {
    currency: string;
    amount: string;
    destinationAddress: string;
    destinationNetwork?: string;
    memo?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);

  let network: string | undefined;
  try {
    network = resolveBushaNetwork(params.currency, params.destinationNetwork);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || 'Unsupported network');
  }

  try {
    const limits = await getBushaCurrencyNetworkLimits(params.currency, network);
    const min = limits.minWithdraw != null ? parseFloat(String(limits.minWithdraw)) : NaN;
    const amount = parseFloat(String(params.amount).replace(/,/g, ''));
    if (Number.isFinite(min) && min > 0 && Number.isFinite(amount) && amount < min) {
      throw ApiError.badRequest(
        `Minimum send on ${network} is ${limits.minWithdraw} ${params.currency.toUpperCase()}.`
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }

  const trade = await executeBushaCryptoSend({
    adminUserId: userId,
    customerId: customer.id,
    currency: params.currency,
    amount: params.amount,
    destinationAddress: params.destinationAddress,
    destinationNetwork: params.destinationNetwork,
    memo: params.memo,
  });

  return bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { userId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function previewAppBushaSend(
  userId: number,
  params: {
    currency: string;
    amount: string;
    destinationNetwork?: string;
    destinationAddress?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  const currency = params.currency.toUpperCase();
  const amount = parseFloat(String(params.amount).replace(/,/g, ''));

  const wallet = await getBushaCustomerWallet(customer.id, currency);
  const bal = wallet.balances.find((b: any) => b.currency?.toUpperCase() === currency);
  const available = parseFloat(bal?.available?.amount || '0');
  const sufficient = Number.isFinite(amount) && amount > 0 && available >= amount;

  const sendPreview = await previewBushaCryptoSend({
    customerId: customer.id,
    currency,
    amount: String(params.amount),
    destinationAddress: params.destinationAddress,
    destinationNetwork: params.destinationNetwork,
  });

  const belowMin =
    sendPreview.belowMinimum ||
    (sendPreview.minWithdraw != null &&
      Number.isFinite(amount) &&
      amount > 0 &&
      amount < parseFloat(String(sendPreview.minWithdraw)));

  const canProceed =
    sufficient &&
    !belowMin &&
    !sendPreview.quoteError &&
    !!String(params.destinationAddress || '').trim();

  return {
    currency,
    network: sendPreview.network,
    amount: params.amount,
    available: String(available),
    sufficient,
    hasSufficientBalance: sufficient,
    canProceed,
    fromAddress: sendPreview.fromAddress,
    toAddress: sendPreview.toAddress || String(params.destinationAddress || '').trim() || null,
    fees: sendPreview.fees,
    networkFee: sendPreview.networkFee,
    networkFeeCurrency: sendPreview.networkFeeCurrency,
    withdrawalFee: (sendPreview as any).withdrawalFee || sendPreview.networkFee || null,
    minWithdraw: sendPreview.minWithdraw,
    belowMinimum: belowMin,
    quoteError: sendPreview.quoteError,
    providerErrorRaw: (sendPreview as any).providerErrorRaw || null,
    quote: sendPreview.quote,
  };
}

/** Catalog limits for a currency (all networks) from Busha GET /v1/currencies/{code}. */
export async function getAppBushaCurrencyLimits(
  userId: number,
  currency: string,
  network?: string
) {
  await assertBushaAppActive();
  await ensureBushaCustomerForUser(userId);
  return getBushaCurrencyNetworkLimits(currency, network);
}

export async function getAppBushaTrade(userId: number, tradeId: string) {
  await assertBushaAppActive();
  const trade = await getBushaTrade(tradeId);
  if (trade.userId && trade.userId !== userId) {
    throw ApiError.forbidden('Not your trade');
  }
  const customer = await ensureBushaCustomerForUser(userId);
  if (trade.customerId !== customer.id && trade.userId !== userId) {
    throw ApiError.forbidden('Not your trade');
  }
  return trade;
}

export async function refreshAppBushaTrade(userId: number, tradeId: string) {
  const trade = await getAppBushaTrade(userId, tradeId);
  await refreshBushaTrade(trade.id);
  await settleBushaTradeIfNeeded(trade.id);
  return getBushaTrade(trade.id);
}

export async function listAppBushaTrades(userId: number, limit = 30) {
  await assertBushaAppActive();
  return bushaTradeLogModel.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
