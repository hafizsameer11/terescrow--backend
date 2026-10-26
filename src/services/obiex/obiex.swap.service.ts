/**
 * Obiex crypto↔crypto swap (convert) — Busha-shaped preview/execute.
 * Isolated from Busha; only touches Obiex ledger + Obiex trade APIs.
 */
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { obiexClient, ObiexApiError } from './obiex.client';
import {
  creditObiexAsset,
  debitObiexAsset,
  getObiexAvailable,
} from './obiex.ledger.service';
import { formatAmountStr, getObiexConfigRow } from './obiex.markup';
import { isObiexCurrencyHidden, resolveObiexLedgerCurrency } from './obiex.currency-map';
import { beginTradeRecon, finalizeTradeRecon } from './obiex.reconcile.service';
import { obiexConfig } from './obiex.config';

const tradeModel = () => (prisma as any).obiexTradeLog;

async function assertObiexAppActive() {
  if (!obiexConfig.isConfigured()) {
    throw ApiError.badRequest('Crypto trading is temporarily unavailable. Please try again later.');
  }
  const settings = await getObiexConfigRow();
  if (!settings?.isActive) {
    throw ApiError.badRequest('Crypto trading is temporarily unavailable. Please try again later.');
  }
  return settings;
}

/** Soft product minimum (USDT notional). Obiex has no official minSwap field. */
const MIN_SWAP_USDT_NOTIONAL = 1;

function unwrapData(res: any) {
  return res?.data ?? res;
}

function toPublicError(
  msg: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const raw = String(msg || '').trim();
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/\bObiex\b/gi, '')
    .replace(/\bBusha\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:—\-]+|[\s:—\-]+$/g, '')
    .trim();
  if (!cleaned || /^(request failed|api error)(\s*\(\d+\))?$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

type SwapLeg = {
  /** Currency user spends (app from) */
  from: string;
  /** Currency user receives (app to) */
  to: string;
  /** Obiex pair source code */
  pairSource: string;
  /** Obiex pair target code */
  pairTarget: string;
  side: 'BUY' | 'SELL';
  /** Amount sent to Obiex quote/swap (in pair quote units for BUY, base for SELL) */
  obiexAmount: number;
  userAmount: number;
};

type PairRow = {
  sourceCode: string;
  targetCode: string;
  isBuyable: boolean;
  isSellable: boolean;
};

async function loadActivePairs(): Promise<PairRow[]> {
  const raw = unwrapData(await obiexClient.getPairs());
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((p: any) => p?.active !== false)
    .map((p: any) => ({
      sourceCode: String(p?.source?.code || '').toUpperCase(),
      targetCode: String(p?.target?.code || '').toUpperCase(),
      isBuyable: !!p?.isBuyable,
      isSellable: !!p?.isSellable,
    }))
    .filter((p: PairRow) => p.sourceCode && p.targetCode);
}

/**
 * Map user from→to into Obiex pair orientation + BUY/SELL.
 * ETH→USDT => SELL ETH/USDT; USDT→ETH => BUY ETH/USDT (amount in USDT).
 */
export async function resolveObiexSwapLeg(
  fromCurrency: string,
  toCurrency: string,
  userAmount: number
): Promise<SwapLeg> {
  const from = String(fromCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  if (!from || !to) throw ApiError.badRequest('sourceCurrency and targetCurrency are required');
  if (from === to) throw ApiError.badRequest('sourceCurrency and targetCurrency must differ');
  if (!Number.isFinite(userAmount) || userAmount <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const pairs = await loadActivePairs();

  const direct = pairs.find((p) => p.sourceCode === from && p.targetCode === to);
  if (direct?.isSellable) {
    return {
      from,
      to,
      pairSource: from,
      pairTarget: to,
      side: 'SELL',
      obiexAmount: userAmount,
      userAmount,
    };
  }

  const inverse = pairs.find((p) => p.sourceCode === to && p.targetCode === from);
  if (inverse?.isBuyable) {
    return {
      from,
      to,
      pairSource: to,
      pairTarget: from,
      side: 'BUY',
      obiexAmount: userAmount,
      userAmount,
    };
  }

  throw ApiError.badRequest(`Swap pair ${from} → ${to} is not available`);
}

function notionalUsdt(quote: any, leg: SwapLeg): number {
  const amount = Number(quote?.amount) || leg.obiexAmount;
  const received = Number(quote?.amountReceived) || 0;
  const srcUsd = Number(quote?.sourceDollarRate);
  const tgtUsd = Number(quote?.targetDollarRate);

  if (leg.side === 'SELL') {
    // Spending pair source (e.g. ETH)
    if (Number.isFinite(srcUsd) && srcUsd > 0) return amount * srcUsd;
    if (leg.pairTarget === 'USDT' || leg.pairTarget === 'USDC') return received;
  } else {
    // Spending pair target (e.g. USDT)
    if (leg.pairTarget === 'USDT' || leg.pairTarget === 'USDC') return amount;
    if (Number.isFinite(tgtUsd) && tgtUsd > 0) return amount * tgtUsd;
    if (Number.isFinite(srcUsd) && srcUsd > 0) return received * srcUsd;
  }
  return 0;
}

async function createObiexSwapQuote(leg: SwapLeg) {
  try {
    const res = await obiexClient.createQuote({
      sourceId: leg.pairSource,
      targetId: leg.pairTarget,
      amount: leg.obiexAmount,
      side: leg.side,
    });
    return unwrapData(res);
  } catch (error: any) {
    if (error instanceof ObiexApiError) {
      const detail = Array.isArray((error.data as any)?.errors)
        ? (error.data as any).errors.map((e: any) => e?.message).filter(Boolean).join('; ')
        : '';
      const combined = detail || error.message;
      if (/pair not available|could not create quote/i.test(combined)) {
        throw ApiError.badRequest(
          `Swap not available for this amount or pair. Minimum is about ${MIN_SWAP_USDT_NOTIONAL} USD equivalent.`
        );
      }
      throw ApiError.badRequest(toPublicError(combined, 'Could not get a swap quote. Please try again.'));
    }
    throw error;
  }
}

function buildBushaStylePreview(params: {
  leg: SwapLeg;
  quote: any;
  available: number;
}) {
  const { leg, quote, available } = params;
  const targetAmount = Number(quote?.amountReceived);
  const targetAmountStr = Number.isFinite(targetAmount)
    ? formatAmountStr(targetAmount, 8)
    : '0';
  const rateVal = quote?.rate;
  const rateDisplay =
    rateVal != null && rateVal !== ''
      ? String(typeof rateVal === 'object' ? rateVal?.rate ?? rateVal : rateVal)
      : null;
  const expiresAt = quote?.expiryDate || null;
  const expiresIn = quote?.expiresIn != null ? Number(quote.expiresIn) : null;
  const sufficient =
    Number.isFinite(leg.userAmount) &&
    leg.userAmount > 0 &&
    available + 1e-12 >= leg.userAmount;
  const usdNotional = notionalUsdt(quote, leg);
  const belowMinimum =
    Number.isFinite(usdNotional) && usdNotional > 0 && usdNotional + 1e-9 < MIN_SWAP_USDT_NOTIONAL;
  const canProceed = sufficient && !belowMinimum && Number.isFinite(targetAmount) && targetAmount > 0;

  const quoteShaped = {
    id: quote?.id || null,
    source_currency: leg.from,
    target_currency: leg.to,
    source_amount: formatAmountStr(leg.userAmount, 8),
    target_amount: targetAmountStr,
    rate: rateVal ?? null,
    rate_display: rateDisplay,
    side: leg.side,
    pair: `${leg.pairSource}-${leg.pairTarget}`,
    expires_at: expiresAt,
    expires_in: expiresIn,
    source_dollar_rate: quote?.sourceDollarRate ?? null,
    target_dollar_rate: quote?.targetDollarRate ?? null,
    fees: [] as any[],
    provider: 'obiex',
  };

  return {
    quote: quoteShaped,
    available: formatAmountStr(available, 8),
    sufficient,
    hasSufficientBalance: sufficient,
    canProceed,
    belowMinimum,
    minSwapUsd: MIN_SWAP_USDT_NOTIONAL,
    estimatedUsd: Number.isFinite(usdNotional) ? formatAmountStr(usdNotional, 2) : null,
    sourceCurrency: leg.from,
    targetCurrency: leg.to,
    sourceAmount: formatAmountStr(leg.userAmount, 8),
    targetAmount: targetAmountStr,
    rate: rateVal ?? null,
    fees: [],
    expiresAt,
    expiresIn,
    // Legacy swap-UI aliases (same as Busha — mobile expects from*/to*/gas*/total*)
    fromCurrency: leg.from,
    toCurrency: leg.to,
    fromAmount: formatAmountStr(leg.userAmount, 8),
    toAmount: targetAmountStr,
    fromBlockchain: leg.from,
    toBlockchain: leg.to,
    fromAmountUsd: null as string | null,
    toAmountUsd: null as string | null,
    gasFee: '0',
    gasFeeUsd: '0',
    totalAmount: formatAmountStr(leg.userAmount, 8),
    totalAmountUsd: null as string | null,
    rateDisplay,
    source: 'obiex' as const,
  };
}

/** List swap-capable currency pairs for the app picker. */
export async function listAppObiexSwapPairs() {
  await assertObiexAppActive();
  const pairs = await loadActivePairs();
  const out: Array<{
    fromCurrency: string;
    toCurrency: string;
    side: 'BUY' | 'SELL';
    pair: string;
  }> = [];

  for (const p of pairs) {
    // Skip pure fiat hubs that aren't useful for in-app crypto swap UI
    if (p.sourceCode === 'NGNX' || p.targetCode === 'NGNX') continue;
    if (p.sourceCode === 'GHS' || p.targetCode === 'GHS') continue;
    if (isObiexCurrencyHidden(p.sourceCode) || isObiexCurrencyHidden(p.targetCode)) continue;

    if (p.isSellable) {
      out.push({
        fromCurrency: p.sourceCode,
        toCurrency: p.targetCode,
        side: 'SELL',
        pair: `${p.sourceCode}-${p.targetCode}`,
      });
    }
    if (p.isBuyable) {
      out.push({
        fromCurrency: p.targetCode,
        toCurrency: p.sourceCode,
        side: 'BUY',
        pair: `${p.sourceCode}-${p.targetCode}`,
      });
    }
  }

  return {
    pairs: out,
    minSwapUsd: MIN_SWAP_USDT_NOTIONAL,
    quoteExpiresInSeconds: 4,
    source: 'obiex' as const,
  };
}

export async function previewAppObiexSwap(
  userId: number,
  params: {
    sourceCurrency?: string;
    targetCurrency?: string;
    sourceAmount?: string;
    fromCurrency?: string;
    toCurrency?: string;
    fromAmount?: string;
  }
) {
  await assertObiexAppActive();
  const from = String(params.sourceCurrency || params.fromCurrency || '').toUpperCase();
  const to = String(params.targetCurrency || params.toCurrency || '').toUpperCase();
  if (isObiexCurrencyHidden(from) || isObiexCurrencyHidden(to)) {
    throw ApiError.badRequest('This asset is temporarily unavailable for convert.');
  }
  const amountRaw = params.sourceAmount ?? params.fromAmount ?? '';
  const amount = parseFloat(String(amountRaw).replace(/,/g, ''));

  const fromLedger = await resolveObiexLedgerCurrency(from);
  const toLedger = await resolveObiexLedgerCurrency(to);
  if (isObiexCurrencyHidden(fromLedger) || isObiexCurrencyHidden(toLedger)) {
    throw ApiError.badRequest('This asset is temporarily unavailable for convert.');
  }
  const leg = await resolveObiexSwapLeg(fromLedger, toLedger, amount);

  const available = await getObiexAvailable(userId, leg.from);
  const quote = await createObiexSwapQuote(leg);
  return buildBushaStylePreview({ leg, quote, available });
}

export async function executeAppObiexSwap(
  userId: number,
  params: {
    sourceCurrency?: string;
    targetCurrency?: string;
    sourceAmount?: string;
    fromCurrency?: string;
    toCurrency?: string;
    fromAmount?: string;
  }
) {
  await assertObiexAppActive();
  const from = String(params.sourceCurrency || params.fromCurrency || '').toUpperCase();
  const to = String(params.targetCurrency || params.toCurrency || '').toUpperCase();
  if (isObiexCurrencyHidden(from) || isObiexCurrencyHidden(to)) {
    throw ApiError.badRequest('This asset is temporarily unavailable for convert.');
  }
  const amountRaw = params.sourceAmount ?? params.fromAmount ?? '';
  const amount = parseFloat(String(amountRaw).replace(/,/g, ''));

  const fromLedger = await resolveObiexLedgerCurrency(from);
  const toLedger = await resolveObiexLedgerCurrency(to);
  if (isObiexCurrencyHidden(fromLedger) || isObiexCurrencyHidden(toLedger)) {
    throw ApiError.badRequest('This asset is temporarily unavailable for convert.');
  }
  const leg = await resolveObiexSwapLeg(fromLedger, toLedger, amount);

  const available = await getObiexAvailable(userId, leg.from);
  if (available + 1e-12 < leg.userAmount) {
    throw ApiError.badRequest('Insufficient balance for this convert');
  }

  // Fresh quote for amountReceived + min check (quotes expire ~4s)
  const quote = await createObiexSwapQuote(leg);
  const preview = buildBushaStylePreview({ leg, quote, available });
  if (preview.belowMinimum) {
    throw ApiError.badRequest(
      `Minimum swap is about ${MIN_SWAP_USDT_NOTIONAL} USD equivalent.`
    );
  }
  if (!preview.canProceed) {
    throw ApiError.badRequest('Insufficient balance for this convert');
  }

  const expectedReceived = Number(quote?.amountReceived);
  if (!Number.isFinite(expectedReceived) || expectedReceived <= 0) {
    throw ApiError.badRequest('Could not get a swap quote. Please try again.');
  }

  const trade = await tradeModel().create({
    data: {
      userId,
      side: 'convert',
      sourceCurrency: leg.from,
      targetCurrency: leg.to,
      sourceAmount: formatAmountStr(leg.userAmount, 8),
      status: 'processing',
      initiatedById: userId,
      providerResponse: {
        preview,
        leg,
        quoteId: quote?.id || null,
      },
    },
  });

  await beginTradeRecon({
    tradeLogId: trade.id,
    userId,
    side: 'convert',
    coinCurrency: leg.from,
    expectedUserLedgerDelta: -leg.userAmount,
    expectedMasterCoinDelta: -leg.userAmount,
    includeNgnx: false,
  });

  let debited = false;
  try {
    await debitObiexAsset(userId, leg.from, leg.userAmount);
    debited = true;

    // Prefer instantSwap with correct side (acceptQuote window is only ~4s)
    const swap = await obiexClient.instantSwap({
      sourceId: leg.pairSource,
      targetId: leg.pairTarget,
      amount: leg.obiexAmount,
      side: leg.side,
    });
    const swapData = unwrapData(swap);
    const received = Number(
      swapData?.amountReceived ?? swapData?.targetAmount ?? expectedReceived ?? 0
    );
    if (!Number.isFinite(received) || received <= 0) {
      throw ApiError.badRequest('Trade could not be completed. Please try again.');
    }

    await creditObiexAsset(userId, leg.to, received);

    await finalizeTradeRecon({
      tradeLogId: trade.id,
      expectedMasterCoinDelta: -leg.userAmount,
      expectedUserLedgerDelta: -leg.userAmount,
      includeNgnx: false,
    });

    const updated = await tradeModel().update({
      where: { id: trade.id },
      data: {
        targetAmount: formatAmountStr(received, 8),
        obiexReference: swapData?.reference ? String(swapData.reference) : null,
        obiexTransactionId: swapData?.id ? String(swapData.id) : quote?.id ? String(quote.id) : null,
        obiexStatus: 'SUCCESSFUL',
        status: 'completed',
        completedAt: new Date(),
        providerResponse: {
          leg,
          quote,
          swap: swapData,
          targetReceived: received,
          preview,
        },
      },
    });

    return {
      trade: updated,
      // Busha-ish top-level aliases for mobile
      id: updated.id,
      status: updated.status,
      side: 'convert',
      sourceCurrency: leg.from,
      targetCurrency: leg.to,
      sourceAmount: formatAmountStr(leg.userAmount, 8),
      targetAmount: formatAmountStr(received, 8),
      fromCurrency: leg.from,
      toCurrency: leg.to,
      fromAmount: formatAmountStr(leg.userAmount, 8),
      toAmount: formatAmountStr(received, 8),
      source: 'obiex' as const,
    };
  } catch (error: any) {
    if (debited) {
      await creditObiexAsset(userId, leg.from, leg.userAmount).catch(() => undefined);
    }
    await tradeModel()
      .update({
        where: { id: trade.id },
        data: {
          status: 'failed',
          errorMessage: error?.message || 'Swap failed',
        },
      })
      .catch(() => undefined);
    try {
      await finalizeTradeRecon({ tradeLogId: trade.id, includeNgnx: false });
    } catch {
      /* best-effort */
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof ObiexApiError) {
      throw ApiError.badRequest(toPublicError(error.message));
    }
    throw error;
  }
}
