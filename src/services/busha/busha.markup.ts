import { getBushaConfigRow } from './busha.trade.service';

export type BushaMarkupPercents = {
  buyMarkupPercent: number;
  sellMarkupPercent: number;
};

function parsePercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  // Cap absurd values
  if (n > 100) return 100;
  return n;
}

export async function getBushaMarkupPercents(): Promise<BushaMarkupPercents> {
  const settings = await getBushaConfigRow();
  return {
    buyMarkupPercent: parsePercent((settings as any)?.buyMarkupPercent),
    sellMarkupPercent: parsePercent((settings as any)?.sellMarkupPercent),
  };
}

/** NGN sent to Busha on buy = user debit / (1 + buy%). */
export function bushaBuySourceNgn(userNgn: number, buyMarkupPercent: number): number {
  if (!Number.isFinite(userNgn) || userNgn <= 0) return 0;
  const m = parsePercent(buyMarkupPercent);
  if (m <= 0) return userNgn;
  return userNgn / (1 + m / 100);
}

/** NGN credited to user on sell = Busha payout × (1 − sell%). */
export function userSellCreditNgn(bushaNgn: number, sellMarkupPercent: number): number {
  if (!Number.isFinite(bushaNgn) || bushaNgn <= 0) return 0;
  const m = parsePercent(sellMarkupPercent);
  if (m <= 0) return bushaNgn;
  return bushaNgn * (1 - m / 100);
}

export function roundNgn(amount: number, decimals = 2): number {
  if (!Number.isFinite(amount)) return 0;
  const f = 10 ** decimals;
  return Math.round(amount * f) / f;
}

export function formatAmountStr(amount: number, decimals = 8): string {
  if (!Number.isFinite(amount)) return '0';
  // Trim trailing zeros but keep enough precision for crypto
  const s = amount.toFixed(decimals);
  return s.replace(/\.?0+$/, '') || '0';
}
