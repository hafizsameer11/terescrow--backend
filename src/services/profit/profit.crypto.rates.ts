import cryptoRateService, { roundNairaRate } from '../crypto/crypto.rate.service';

export type CryptoSpreadProfitRates = {
  /** USD notional used when applying NGN/$ spread. */
  spreadAmount: string;
  /** NGN per USD when user sells crypto to us (lower rate). */
  userSellRateNgnPerUsd: string;
  /** NGN per USD when user buys crypto from us (higher rate). */
  userBuyRateNgnPerUsd: string;
};

/** Ledger field names (internal): buyRate = user sell rate, sellRate = user buy rate. */
export type CryptoSpreadLedgerRates = {
  spreadAmount: string;
  buyRate: string;
  sellRate: string;
};

const MIN_NGN_PER_USD = 200;
const MAX_NGN_PER_USD = 15_000;

function parseUsd(amountUsd: number | string): number | null {
  const usd = typeof amountUsd === 'string' ? parseFloat(amountUsd) : amountUsd;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return usd;
}

function parseRate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isPlausibleNgnPerUsd(rate: number): boolean {
  return rate >= MIN_NGN_PER_USD && rate <= MAX_NGN_PER_USD;
}

function deriveRateFromAmounts(amountNgn: unknown, amountUsd: number): number | null {
  const ngn = parseRate(amountNgn);
  if (ngn == null) return null;
  const rate = ngn / amountUsd;
  return isPlausibleNgnPerUsd(rate) ? rate : null;
}

function toLedgerRates(spread: CryptoSpreadProfitRates): CryptoSpreadLedgerRates {
  return {
    spreadAmount: spread.spreadAmount,
    buyRate: spread.userSellRateNgnPerUsd,
    sellRate: spread.userBuyRateNgnPerUsd,
  };
}

function normalizeSpread(userSellRate: number, userBuyRate: number): CryptoSpreadProfitRates | null {
  if (!isPlausibleNgnPerUsd(userSellRate) || !isPlausibleNgnPerUsd(userBuyRate)) return null;
  const lower = Math.min(userSellRate, userBuyRate);
  const higher = Math.max(userSellRate, userBuyRate);
  return {
    spreadAmount: '',
    userSellRateNgnPerUsd: String(roundNairaRate(lower)),
    userBuyRateNgnPerUsd: String(roundNairaRate(higher)),
  };
}

async function liveTierRates(usd: number): Promise<{ userSell: number | null; userBuy: number | null }> {
  const [buyTier, sellTier] = await Promise.all([
    cryptoRateService.getRateForAmount('BUY', usd),
    cryptoRateService.getRateForAmount('SELL', usd),
  ]);

  const userBuy = buyTier ? parseRate(buyTier.rate.toString()) : null;
  const userSell = sellTier ? parseRate(sellTier.rate.toString()) : null;

  return {
    userSell: userSell != null && isPlausibleNgnPerUsd(userSell) ? userSell : null,
    userBuy: userBuy != null && isPlausibleNgnPerUsd(userBuy) ? userBuy : null,
  };
}

/** Resolve spread for a crypto SELL — prefer rates actually used on the transaction. */
export async function resolveCryptoSpreadForSell(params: {
  amountUsd: number | string;
  amountNgn?: number | string | null;
  rateUsdToNgn?: string | null;
}): Promise<CryptoSpreadLedgerRates | null> {
  const usd = parseUsd(params.amountUsd);
  if (usd == null) return null;

  let userSell =
    parseRate(params.rateUsdToNgn) ??
    deriveRateFromAmounts(params.amountNgn, usd);

  const live = await liveTierRates(usd);
  let userBuy = live.userBuy;

  if (userSell == null) userSell = live.userSell;
  if (userBuy == null) userBuy = live.userBuy;
  if (userSell == null) userSell = live.userSell;

  if (userSell == null || userBuy == null) return null;

  const normalized = normalizeSpread(userSell, userBuy);
  if (!normalized) return null;

  return toLedgerRates({ ...normalized, spreadAmount: String(usd) });
}

/** Resolve spread for a crypto BUY — prefer rates actually used on the transaction. */
export async function resolveCryptoSpreadForBuy(params: {
  amountUsd: number | string;
  amountNgn?: number | string | null;
  rateNgnToUsd?: string | null;
}): Promise<CryptoSpreadLedgerRates | null> {
  const usd = parseUsd(params.amountUsd);
  if (usd == null) return null;

  let userBuy =
    parseRate(params.rateNgnToUsd) ??
    deriveRateFromAmounts(params.amountNgn, usd);

  const live = await liveTierRates(usd);
  let userSell = live.userSell;

  if (userBuy == null) userBuy = live.userBuy;
  if (userSell == null) userSell = live.userSell;

  if (userSell == null || userBuy == null) return null;

  const normalized = normalizeSpread(userSell, userBuy);
  if (!normalized) return null;

  return toLedgerRates({ ...normalized, spreadAmount: String(usd) });
}

/** Backfill helper: prefer rates stored on the tx, fetch missing tier from live rate tables. */
export async function resolveCryptoSpreadProfitRatesFromStored(params: {
  amountUsd: number | string;
  amountNgn?: number | string | null;
  side: 'BUY' | 'SELL';
  storedBuyTierNgnPerUsd?: string | null;
  storedSellTierNgnPerUsd?: string | null;
}): Promise<CryptoSpreadLedgerRates | null> {
  if (params.side === 'SELL') {
    return resolveCryptoSpreadForSell({
      amountUsd: params.amountUsd,
      amountNgn: params.amountNgn,
      rateUsdToNgn: params.storedSellTierNgnPerUsd,
    });
  }
  return resolveCryptoSpreadForBuy({
    amountUsd: params.amountUsd,
    amountNgn: params.amountNgn,
    rateNgnToUsd: params.storedBuyTierNgnPerUsd,
  });
}

/** @deprecated Use resolveCryptoSpreadForSell/Buy — kept for callers that only have USD. */
export async function resolveCryptoSpreadProfitRates(
  amountUsd: number | string
): Promise<CryptoSpreadLedgerRates | null> {
  const usd = parseUsd(amountUsd);
  if (usd == null) return null;
  const live = await liveTierRates(usd);
  if (live.userSell == null || live.userBuy == null) return null;
  const normalized = normalizeSpread(live.userSell, live.userBuy);
  if (!normalized) return null;
  return toLedgerRates({ ...normalized, spreadAmount: String(usd) });
}
