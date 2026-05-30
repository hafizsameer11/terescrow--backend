import { Decimal } from '@prisma/client/runtime/library';

/** Naira amounts are whole numbers — no decimal kobo in this product. */
export function formatNairaAmount(value: string | number | Decimal | null | undefined): string {
  if (value == null || value === '') return '0';
  let n: number;
  try {
    n = value instanceof Decimal ? value.toNumber() : Number(String(value).replace(/,/g, '').trim());
  } catch {
    return String(value);
  }
  if (!Number.isFinite(n)) return String(value);
  return String(Math.round(n));
}

export function roundNairaAmount(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value);
}
