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

const tradeModel = () => (prisma as any).obiexTradeLog;
const depositModel = () => (prisma as any).obiexDepositAddress;

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
        networksByCurrency[code.toUpperCase()] = nets
          .filter((n: any) => n?.isReceivable || n?.isWithdrawable)
          .map((n: any) => String(n.networkCode || n.code || '').toUpperCase())
          .filter(Boolean);
      }

      assets = crypto.map((code) => {
        const nets = networksByCurrency[code] || [];
        const netEntries = Array.isArray(netMap[code]?.networks) ? netMap[code].networks : [];
        return {
          code,
          name: code,
          networks: nets,
          defaultNetwork: nets[0] || '',
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

export async function getAppObiexAssets(userId: number) {
  const status = await getAppObiexStatus(userId);
  return { assets: status.currencies.assets || [] };
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

  try {
    const balRes = await obiexClient.getWalletBalance('NGNX');
    const available = Number(unwrapData(balRes)?.availableBalance ?? unwrapData(balRes)?.totalSwappableBalance ?? 0);
    if (available + 1e-9 < obiexNgn) {
      throw ApiError.badRequest('Obiex NGNX float insufficient — fund master wallet');
    }

    const swap = await obiexClient.instantSwap({
      sourceId: 'NGNX',
      targetId: target,
      amount: obiexNgn,
      side: 'SELL',
    });
    const swapData = unwrapData(swap);
    const received = Number(swapData?.amountReceived ?? swapData?.targetAmount ?? 0);
    if (!Number.isFinite(received) || received <= 0) {
      throw ApiError.badRequest('Obiex swap returned no crypto amount');
    }

    await creditObiexAsset(userId, target, received);
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: { status: 'completed' },
    });

    const trade = await tradeModel().create({
      data: {
        userId,
        side: 'buy',
        sourceCurrency: 'NGN',
        targetCurrency: target,
        sourceAmount: formatAmountStr(userNgn, 2),
        targetAmount: formatAmountStr(received, 8),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        fiatTransactionId: fiatTxn.id,
        status: 'completed',
        completedAt: new Date(),
        initiatedById: userId,
        providerResponse: {
          buyMode: 'master_swap',
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

    return { trade };
  } catch (error: any) {
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
  const source = String(params.sourceCurrency || 'USDT').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  await debitObiexAsset(userId, source, amount);

  const usdNotional = parseFloat(String(params.usdAmount ?? '').replace(/,/g, ''));
  const resolved = await resolveObiexMarkupForUsdAmount(
    'sell',
    Number.isFinite(usdNotional) && usdNotional > 0 ? usdNotional : amount
  );

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

    const trade = await tradeModel().create({
      data: {
        userId,
        side: 'sell',
        sourceCurrency: source,
        targetCurrency: 'NGN',
        sourceAmount: formatAmountStr(amount, 8),
        targetAmount: formatAmountStr(userNgn, 2),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        fiatTransactionId: fiatTxn.id,
        status: 'completed',
        completedAt: new Date(),
        initiatedById: userId,
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

    return { trade };
  } catch (error: any) {
    await creditObiexAsset(userId, source, amount);
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
  const source = String(params.sourceCurrency).toUpperCase();
  const target = String(params.targetCurrency).toUpperCase();
  const amount = parseFloat(String(params.sourceAmount).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }
  if (source === target) throw ApiError.badRequest('source and target must differ');

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
    const trade = await tradeModel().create({
      data: {
        userId,
        side: 'convert',
        sourceCurrency: source,
        targetCurrency: target,
        sourceAmount: formatAmountStr(amount, 8),
        targetAmount: formatAmountStr(received, 8),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : null,
        obiexStatus: 'SUCCESSFUL',
        status: 'completed',
        completedAt: new Date(),
        initiatedById: userId,
        providerResponse: { swap: swapData },
      },
    });
    return { trade };
  } catch (error: any) {
    await creditObiexAsset(userId, source, amount);
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
  const address = String(params.address || '').trim();
  if (!currency || !network || !address) {
    throw ApiError.badRequest('currency, network, and address required');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }
  const available = await getObiexAvailable(userId, currency);
  if (available + 1e-12 < amount) throw ApiError.badRequest(`Insufficient ${currency}`);
  return {
    canProceed: true,
    currency,
    network,
    address,
    amount: formatAmountStr(amount, 8),
    available: formatAmountStr(available, 8),
  };
}

export async function executeAppObiexSend(
  userId: number,
  params: { currency: string; amount: string; network: string; address: string }
) {
  await assertObiexAppActive();
  const currency = String(params.currency).toUpperCase();
  const network = String(params.network).toUpperCase();
  const amount = parseFloat(String(params.amount).replace(/,/g, ''));
  const address = String(params.address || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }

  await debitObiexAsset(userId, currency, amount);

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
    },
  });

  try {
    const res = await obiexClient.withdrawCrypto({
      currency,
      amount,
      destination: { address, network },
    });
    const data = unwrapData(res);
    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        obiexReference: data?.reference ? String(data.reference) : null,
        obiexTransactionId: data?.transactionId || data?.id ? String(data.transactionId || data.id) : null,
        obiexStatus: data?.status || 'PROCESSING',
        status: 'processing',
        providerResponse: data,
      },
    });
    return { trade: updated };
  } catch (error: any) {
    await creditObiexAsset(userId, currency, amount);
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'Obiex withdraw failed',
      },
    });
    if (error instanceof ObiexApiError) throw ApiError.badRequest(error.message);
    throw error;
  }
}

export async function listAppObiexTrades(userId: number, limit = 50) {
  await assertObiexAppActive();
  return tradeModel().findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  });
}

export async function getAppObiexTrade(userId: number, id: string) {
  await assertObiexAppActive();
  const trade = await tradeModel().findFirst({ where: { id, userId } });
  if (!trade) throw ApiError.notFound('Trade not found');
  return trade;
}
