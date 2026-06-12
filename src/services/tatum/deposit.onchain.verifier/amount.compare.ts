import { Decimal } from '@prisma/client/runtime/library';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export { TRANSFER_TOPIC };

/** Decode last 20 bytes of a 32-byte topic as checksummed-lowercase hex address. */
export function topicToAddress(topic: string): string {
  const t = topic.trim().toLowerCase();
  const hex = t.startsWith('0x') ? t.slice(2) : t;
  return `0x${hex.slice(-40)}`;
}

export function normalizeEvmAddress(addr: string): string {
  const t = addr.trim().toLowerCase();
  if (t.startsWith('0x')) return t;
  if (/^[0-9a-f]{40}$/.test(t)) return `0x${t}`;
  return t;
}

export function normalizeTronAddress(addr: string): string {
  return addr.trim();
}

export function addressesEqual(a: string, b: string, family: 'evm' | 'tron' | 'utxo' | 'solana'): boolean {
  if (family === 'evm') {
    return normalizeEvmAddress(a) === normalizeEvmAddress(b);
  }
  if (family === 'tron') {
    return normalizeTronAddress(a) === normalizeTronAddress(b);
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Compare human webhook amount to on-chain raw integer with decimals. */
export function amountsMatch(expectedHuman: string, rawAmount: string, decimals: number): boolean {
  try {
    const expected = new Decimal(expectedHuman);
    const raw = BigInt(rawAmount.split('.')[0] || '0');
    const divisor = BigInt(10) ** BigInt(decimals);
    const onChainHuman = new Decimal(raw.toString()).div(divisor.toString());
    const diff = expected.minus(onChainHuman).abs();
    const tolerance = new Decimal(10).pow(-Math.min(decimals, 8));
    return diff.lte(tolerance);
  } catch {
    return false;
  }
}

/** UTXO satoshi / litoshi compare. */
export function utxoAmountsMatch(expectedHuman: string, satoshis: number | string): boolean {
  try {
    const expected = new Decimal(expectedHuman);
    const onChain = new Decimal(String(satoshis)).div(1e8);
    return expected.minus(onChain).abs().lte(new Decimal('0.00000001'));
  } catch {
    return false;
  }
}

export function parseHexValue(value: unknown): bigint {
  if (value == null) return BigInt(0);
  if (typeof value === 'number') return BigInt(value);
  const s = String(value);
  if (s.startsWith('0x')) return BigInt(s);
  return BigInt(s.split('.')[0] || '0');
}

export function evmTxSucceeded(status: unknown): boolean {
  if (status === true) return true;
  if (status === false) return false;
  const s = String(status).toLowerCase();
  return s === '0x1' || s === '1' || s === 'true';
}
