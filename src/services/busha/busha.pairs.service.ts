import ApiError from '../../utils/ApiError';
import { bushaClient, type BushaPair } from './busha.client';
import { bushaConfig } from './busha.config';

export type BushaAssetRampLimits = {
  /** Crypto code (pair base), e.g. USDT */
  currency: string;
  /** Buy: user spends NGN — use counter amounts */
  minBuyNgn: number | null;
  maxBuyNgn: number | null;
  minBuyCrypto: number | null;
  maxBuyCrypto: number | null;
  /** Sell: user sells crypto — use base amounts */
  minSellCrypto: number | null;
  maxSellCrypto: number | null;
  minSellNgn: number | null;
  maxSellNgn: number | null;
};

type CacheEntry = {
  at: number;
  byCurrency: Record<string, BushaAssetRampLimits>;
};

const CACHE_TTL_MS = 60_000;
let cache: CacheEntry | null = null;

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function mapNgnPair(pair: BushaPair): BushaAssetRampLimits | null {
  const base = String(pair.base || '').toUpperCase();
  const counter = String(pair.counter || '').toUpperCase();
  if (!base || counter !== 'NGN') return null;

  return {
    currency: base,
    minBuyNgn: parseAmount(pair.min_buy_amount?.counter?.amount),
    maxBuyNgn: parseAmount(pair.max_buy_amount?.counter?.amount),
    minBuyCrypto: parseAmount(pair.min_buy_amount?.amount),
    maxBuyCrypto: parseAmount(pair.max_buy_amount?.amount),
    minSellCrypto: parseAmount(pair.min_sell_amount?.amount),
    maxSellCrypto: parseAmount(pair.max_sell_amount?.amount),
    minSellNgn: parseAmount(pair.min_sell_amount?.counter?.amount),
    maxSellNgn: parseAmount(pair.max_sell_amount?.counter?.amount),
  };
}

/**
 * Fetch Busha NGN fiat pair limits (cached ~60s).
 * Soft-fails to {} if Busha is unconfigured or the pairs call fails.
 */
export async function getBushaNgnPairLimitsByCurrency(): Promise<
  Record<string, BushaAssetRampLimits>
> {
  if (!bushaConfig.isConfigured()) return {};

  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.byCurrency;
  }

  try {
    const pairs = await bushaClient.listPairs({ currency: 'NGN', type: 'fiat' });
    const byCurrency: Record<string, BushaAssetRampLimits> = {};
    for (const pair of pairs || []) {
      const mapped = mapNgnPair(pair);
      if (mapped) byCurrency[mapped.currency] = mapped;
    }
    cache = { at: now, byCurrency };
    return byCurrency;
  } catch (error) {
    console.warn('[busha.pairs] Failed to load NGN pairs:', (error as Error)?.message || error);
    return cache?.byCurrency || {};
  }
}

export async function getBushaLimitsForCurrency(
  currency: string
): Promise<BushaAssetRampLimits | null> {
  const code = currency.trim().toUpperCase();
  if (!code) return null;
  const all = await getBushaNgnPairLimitsByCurrency();
  return all[code] || null;
}

export async function assertBushaBuyNgnWithinLimits(
  targetCurrency: string,
  ngnAmount: number
): Promise<void> {
  if (!Number.isFinite(ngnAmount) || ngnAmount <= 0) {
    throw ApiError.badRequest('Amount must be greater than 0');
  }
  const limits = await getBushaLimitsForCurrency(targetCurrency);
  if (!limits) return;

  if (limits.minBuyNgn != null && ngnAmount < limits.minBuyNgn) {
    throw ApiError.badRequest(
      `Minimum buy amount is ₦${limits.minBuyNgn.toLocaleString('en-NG', {
        maximumFractionDigits: 2,
      })}`
    );
  }
  if (limits.maxBuyNgn != null && ngnAmount > limits.maxBuyNgn) {
    throw ApiError.badRequest(
      `Maximum buy amount is ₦${limits.maxBuyNgn.toLocaleString('en-NG', {
        maximumFractionDigits: 2,
      })}`
    );
  }
}

export async function assertBushaSellCryptoWithinLimits(
  sourceCurrency: string,
  cryptoAmount: number
): Promise<void> {
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    throw ApiError.badRequest('Amount must be greater than 0');
  }
  const limits = await getBushaLimitsForCurrency(sourceCurrency);
  if (!limits) return;

  const code = sourceCurrency.trim().toUpperCase();
  if (limits.minSellCrypto != null && cryptoAmount < limits.minSellCrypto) {
    throw ApiError.badRequest(
      `Minimum sell amount is ${limits.minSellCrypto} ${code}`
    );
  }
  if (limits.maxSellCrypto != null && cryptoAmount > limits.maxSellCrypto) {
    throw ApiError.badRequest(
      `Maximum sell amount is ${limits.maxSellCrypto} ${code}`
    );
  }
}
