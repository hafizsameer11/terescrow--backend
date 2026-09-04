import { prisma } from '../../utils/prisma';
import { getBushaConfigRow } from './busha.trade.service';

export type BushaMarkupSide = 'buy' | 'sell';

export type BushaMarkupPercents = {
  buyMarkupPercent: number;
  sellMarkupPercent: number;
};

export type ResolvedMarkup = {
  /** Signed % applied to Busha rate: rate × (1 + percent/100). */
  percent: number;
  source: 'range' | 'flat_fallback';
  rangeId?: number | null;
  minUsd?: number | null;
  maxUsd?: number | null;
};

const rangeModel = () => (prisma as any).bushaMarkupRange;

/** Allow signed percents in [-100, 100]. */
export function parseSignedPercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n)) return 0;
  if (n < -100) return -100;
  if (n > 100) return 100;
  return Math.round(n * 10000) / 10000;
}

/** Legacy positive-only parser (flat config fields). */
function parseLegacyPercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export async function getBushaMarkupPercents(): Promise<BushaMarkupPercents> {
  const settings = await getBushaConfigRow();
  return {
    buyMarkupPercent: parseLegacyPercent((settings as any)?.buyMarkupPercent),
    sellMarkupPercent: parseLegacyPercent((settings as any)?.sellMarkupPercent),
  };
}

export async function listBushaMarkupRanges(side?: BushaMarkupSide) {
  const where: any = {};
  if (side) where.side = side;
  return rangeModel().findMany({
    where,
    orderBy: [{ side: 'asc' }, { sortOrder: 'asc' }, { minUsd: 'asc' }],
  });
}

/**
 * Resolve signed markup % for a USD notional.
 * Prefers an active range where minUsd <= usd <= maxUsd.
 * Fallback: flat buy % as-is; flat sell % as negative (legacy: user got less).
 */
export async function resolveMarkupForUsdAmount(
  side: BushaMarkupSide,
  usdAmount: number | null | undefined
): Promise<ResolvedMarkup> {
  const usd = Number(usdAmount);
  if (Number.isFinite(usd) && usd > 0) {
    const ranges = await rangeModel().findMany({
      where: { side, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { minUsd: 'asc' }],
    });
    for (const row of ranges) {
      const min = parseFloat(String(row.minUsd));
      const max = parseFloat(String(row.maxUsd));
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (usd + 1e-9 >= min && usd - 1e-9 <= max) {
        return {
          percent: parseSignedPercent(row.percent),
          source: 'range',
          rangeId: row.id,
          minUsd: min,
          maxUsd: max,
        };
      }
    }
  }

  const flat = await getBushaMarkupPercents();
  if (side === 'buy') {
    return {
      percent: parseSignedPercent(flat.buyMarkupPercent),
      source: 'flat_fallback',
    };
  }
  // Legacy sell markup was positive = user receives less → signed negative
  return {
    percent: parseSignedPercent(-flat.sellMarkupPercent),
    source: 'flat_fallback',
  };
}

/** NGN sent to Busha on buy = user debit / (1 + signed%). */
export function bushaBuySourceNgn(userNgn: number, buyMarkupPercent: number): number {
  if (!Number.isFinite(userNgn) || userNgn <= 0) return 0;
  const m = parseSignedPercent(buyMarkupPercent);
  const denom = 1 + m / 100;
  if (denom <= 0) return userNgn;
  return userNgn / denom;
}

/**
 * NGN credited to user on sell = Busha payout × (1 + signed%).
 * +5% → user gets more; -5% → user gets less (platform take).
 */
export function userSellCreditNgn(bushaNgn: number, sellMarkupPercent: number): number {
  if (!Number.isFinite(bushaNgn) || bushaNgn <= 0) return 0;
  const m = parseSignedPercent(sellMarkupPercent);
  return bushaNgn * (1 + m / 100);
}

/** Apply signed % to a unit rate (e.g. public USDT/NGN). */
export function applySignedRateMarkup(rate: number, percent: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate * (1 + parseSignedPercent(percent) / 100);
}

export function roundNgn(amount: number, decimals = 2): number {
  if (!Number.isFinite(amount)) return 0;
  const f = 10 ** decimals;
  return Math.round(amount * f) / f;
}

export function formatAmountStr(amount: number, decimals = 8): string {
  if (!Number.isFinite(amount)) return '0';
  const s = amount.toFixed(decimals);
  return s.replace(/\.?0+$/, '') || '0';
}
