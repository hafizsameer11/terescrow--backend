import ApiError from '../../utils/ApiError';
import { bushaClient, type BushaPair } from './busha.client';
import { bushaConfig } from './busha.config';
import { getBushaMarkupPercents, roundNgn } from './busha.markup';

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

export type BushaPublicRate = {
  symbol: string;
  name: string;
  pairId: string;
  buyRate: number | null;
  sellRate: number | null;
  midRate: number | null;
  minBuyNgn: number | null;
  minSellNgn: number | null;
  change24h: number | null;
  canBuy: boolean;
  canSell: boolean;
  indicative: true;
};

type CacheEntry = {
  at: number;
  byCurrency: Record<string, BushaAssetRampLimits>;
  pairs: BushaPair[];
};

const CACHE_TTL_MS = 45_000;
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

async function loadNgnPairsCached(): Promise<BushaPair[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.pairs;
  }

  if (!bushaConfig.isConfigured()) {
    return cache?.pairs || [];
  }

  try {
    const pairs = (await bushaClient.listPairs({ currency: 'NGN' })) || [];
    const byCurrency: Record<string, BushaAssetRampLimits> = {};
    for (const pair of pairs) {
      const mapped = mapNgnPair(pair);
      if (mapped) byCurrency[mapped.currency] = mapped;
    }
    cache = { at: now, byCurrency, pairs };
    return pairs;
  } catch (error) {
    console.warn('[busha.pairs] Failed to load NGN pairs:', (error as Error)?.message || error);
    return cache?.pairs || [];
  }
}

/**
 * Fetch Busha NGN fiat pair limits (cached ~45s).
 * Soft-fails to {} if Busha is unconfigured or the pairs call fails.
 */
export async function getBushaNgnPairLimitsByCurrency(): Promise<
  Record<string, BushaAssetRampLimits>
> {
  await loadNgnPairsCached();
  return cache?.byCurrency || {};
}

export async function getBushaLimitsForCurrency(
  currency: string
): Promise<BushaAssetRampLimits | null> {
  const code = currency.trim().toUpperCase();
  if (!code) return null;
  const all = await getBushaNgnPairLimitsByCurrency();
  return all[code] || null;
}

/**
 * Indicative NGN buy/sell rates for pre-KYC browse (from GET /v1/pairs).
 * Applies admin markup on displayed rates when configured.
 */
export async function getBushaPublicNgnRates(): Promise<{
  currency: string;
  cachedAt: number | null;
  rates: BushaPublicRate[];
  disclaimer: string;
}> {
  const pairs = await loadNgnPairsCached();
  const { buyMarkupPercent, sellMarkupPercent } = await getBushaMarkupPercents();

  const rates: BushaPublicRate[] = [];
  for (const pair of pairs) {
    const base = String(pair.base || '').toUpperCase();
    const counter = String(pair.counter || '').toUpperCase();
    if (!base || counter !== 'NGN') continue;

    let buyRate = parseAmount(pair.buy_price?.amount);
    let sellRate = parseAmount(pair.sell_price?.amount);

    if (buyRate != null && buyMarkupPercent > 0) {
      buyRate = roundNgn(buyRate * (1 + buyMarkupPercent / 100), 4);
    }
    if (sellRate != null && sellMarkupPercent > 0) {
      sellRate = roundNgn(sellRate * (1 - sellMarkupPercent / 100), 4);
    }

    const midRate =
      buyRate != null && sellRate != null
        ? roundNgn((buyRate + sellRate) / 2, 4)
        : buyRate ?? sellRate;

    const changeRaw = parseAmount(pair.percentage_change);

    rates.push({
      symbol: base,
      name: pair.base_currency_name || base,
      pairId: pair.id || `${base}NGN`,
      buyRate,
      sellRate,
      midRate,
      minBuyNgn: parseAmount(pair.min_buy_amount?.counter?.amount),
      minSellNgn: parseAmount(pair.min_sell_amount?.counter?.amount),
      change24h: changeRaw,
      canBuy: pair.is_buy_supported !== false && buyRate != null,
      canSell: pair.is_sell_supported !== false && sellRate != null,
      indicative: true,
    });
  }

  rates.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    currency: 'NGN',
    cachedAt: cache?.at ?? null,
    rates,
    disclaimer:
      'Indicative rate only. Complete verification to get an exact quote and trade.',
  };
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
