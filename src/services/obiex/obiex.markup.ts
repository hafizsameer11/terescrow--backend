import { prisma } from '../../utils/prisma';

export type ObiexMarkupSide = 'buy' | 'sell';

export type ResolvedObiexMarkup = {
  percent: number;
  source: 'range' | 'flat_fallback';
  rangeId?: number | null;
  minUsd?: number | null;
  maxUsd?: number | null;
};

const rangeModel = () => (prisma as any).obiexMarkupRange;
const configModel = () => (prisma as any).obiexConfig;

export function parseSignedPercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n)) return 0;
  if (n < -100) return -100;
  if (n > 100) return 100;
  return Math.round(n * 10000) / 10000;
}

function parseLegacyPercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function parseFlatFeeNgn(value: unknown): number {
  const n = parseFloat(String(value ?? '0').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function getObiexConfigRow() {
  const existing = await configModel().findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return configModel().upsert({
    where: { id: 1 },
    create: {
      id: 1,
      buyMode: 'master_swap',
      buyMarkupPercent: 0,
      sellMarkupPercent: 0,
      buyFlatFeeNgn: 0,
      sellFlatFeeNgn: 0,
      collectionsTarget: 'USDT',
      isActive: false,
    },
    update: {},
  });
}

export async function getObiexMarkupPercents() {
  const settings = await getObiexConfigRow();
  return {
    buyMarkupPercent: parseLegacyPercent(settings?.buyMarkupPercent),
    sellMarkupPercent: parseLegacyPercent(settings?.sellMarkupPercent),
  };
}

export async function getObiexFlatFeesNgn() {
  const settings = await getObiexConfigRow();
  return {
    buyFlatFeeNgn: parseFlatFeeNgn(settings?.buyFlatFeeNgn),
    sellFlatFeeNgn: parseFlatFeeNgn(settings?.sellFlatFeeNgn),
  };
}

export async function listObiexMarkupRanges(side?: ObiexMarkupSide) {
  const where: any = {};
  if (side) where.side = side;
  return rangeModel().findMany({
    where,
    orderBy: [{ side: 'asc' }, { sortOrder: 'asc' }, { minUsd: 'asc' }],
  });
}

export async function resolveObiexMarkupForUsdAmount(
  side: ObiexMarkupSide,
  usdAmount: number | null | undefined
): Promise<ResolvedObiexMarkup> {
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

  const flat = await getObiexMarkupPercents();
  if (side === 'buy') {
    return { percent: parseSignedPercent(flat.buyMarkupPercent), source: 'flat_fallback' };
  }
  return { percent: parseSignedPercent(-flat.sellMarkupPercent), source: 'flat_fallback' };
}

/** NGN sent to Obiex on buy = user debit / (1 + signed%). */
export function obiexBuySourceNgn(userNgn: number, buyMarkupPercent: number): number {
  if (!Number.isFinite(userNgn) || userNgn <= 0) return 0;
  const denom = 1 + parseSignedPercent(buyMarkupPercent) / 100;
  if (denom <= 0) return userNgn;
  return userNgn / denom;
}

/** NGN credited to user on sell = Obiex NGNX × (1 + signed%). */
export function userSellCreditNgn(obiexNgn: number, sellMarkupPercent: number): number {
  if (!Number.isFinite(obiexNgn) || obiexNgn <= 0) return 0;
  return obiexNgn * (1 + parseSignedPercent(sellMarkupPercent) / 100);
}

/**
 * Buy split: flat fee taken first, then % markup on the remainder.
 * User pays `userNgn`; Obiex receives `obiexNgn`; platform keeps the rest (gross).
 */
export function splitObiexBuyUserDebit(params: {
  userNgn: number;
  buyMarkupPercent: number;
  buyFlatFeeNgn: number;
}): {
  userNgn: number;
  flatFeeNgn: number;
  percentSpreadNgn: number;
  obiexNgn: number;
  grossPlatformProfitNgn: number;
} {
  const userNgn = roundNgn(params.userNgn);
  const flatFeeNgn = Math.min(parseFlatFeeNgn(params.buyFlatFeeNgn), Math.max(0, userNgn));
  const afterFlat = roundNgn(Math.max(0, userNgn - flatFeeNgn));
  const obiexNgn = roundNgn(obiexBuySourceNgn(afterFlat, params.buyMarkupPercent));
  const percentSpreadNgn = roundNgn(Math.max(0, afterFlat - obiexNgn));
  const grossPlatformProfitNgn = roundNgn(flatFeeNgn + percentSpreadNgn);
  return { userNgn, flatFeeNgn, percentSpreadNgn, obiexNgn, grossPlatformProfitNgn };
}

/**
 * Sell split: apply signed % to Obiex NGNX, then deduct flat sell fee from user credit.
 */
export function splitObiexSellUserCredit(params: {
  obiexNgn: number;
  sellMarkupPercent: number;
  sellFlatFeeNgn: number;
}): {
  obiexNgn: number;
  flatFeeNgn: number;
  percentSpreadNgn: number;
  userNgn: number;
  grossPlatformProfitNgn: number;
} {
  const obiexNgn = roundNgn(params.obiexNgn);
  const afterPct = roundNgn(userSellCreditNgn(obiexNgn, params.sellMarkupPercent));
  // percentSpread: positive when we keep money (sell % stored as negative signed in resolve)
  const percentSpreadNgn = roundNgn(obiexNgn - afterPct);
  const flatFeeNgn = Math.min(parseFlatFeeNgn(params.sellFlatFeeNgn), Math.max(0, afterPct));
  const userNgn = roundNgn(Math.max(0, afterPct - flatFeeNgn));
  const grossPlatformProfitNgn = roundNgn(obiexNgn - userNgn);
  return { obiexNgn, flatFeeNgn, percentSpreadNgn, userNgn, grossPlatformProfitNgn };
}

/** Net admin P&L after provider fees (deposit/withdraw). Negative = loss. */
export function buildObiexFeesForAdmin(params: {
  side: 'buy' | 'sell';
  markupPercent: number;
  flatFeeNgn: number;
  percentSpreadNgn: number;
  grossPlatformProfitNgn: number;
  providerFeesNgn: number;
  userNgn: number;
  obiexNgn: number;
  extra?: Record<string, unknown>;
}) {
  const providerFeesNgn = roundNgn(Math.max(0, params.providerFeesNgn));
  const netPlatformProfitNgn = roundNgn(params.grossPlatformProfitNgn - providerFeesNgn);
  return {
    side: params.side,
    markupPercent: params.markupPercent,
    flatFeeNgn: roundNgn(params.flatFeeNgn),
    percentSpreadNgn: roundNgn(params.percentSpreadNgn),
    grossPlatformProfitNgn: roundNgn(params.grossPlatformProfitNgn),
    providerFeesNgn,
    netPlatformProfitNgn,
    isProfit: netPlatformProfitNgn >= 0,
    userNgn: roundNgn(params.userNgn),
    obiexNgn: roundNgn(params.obiexNgn),
    ...(params.extra || {}),
  };
}

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
