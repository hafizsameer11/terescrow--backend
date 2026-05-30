import { Decimal } from '@prisma/client/runtime/library';

/** Max decimal places for on-chain / wallet crypto quantities in API responses. */
export const CRYPTO_MAX_DECIMALS = 6;

export function formatCryptoAmount(value: string | number | Decimal | null | undefined): string {
  if (value == null || value === '') return '0';
  let n: number;
  try {
    n = value instanceof Decimal ? value.toNumber() : Number(String(value).replace(/,/g, '').trim());
  } catch {
    return String(value);
  }
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return '0';
  const fixed = n.toFixed(CRYPTO_MAX_DECIMALS);
  return fixed.replace(/\.?0+$/, '') || '0';
}
