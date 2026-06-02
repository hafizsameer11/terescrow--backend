/**
 * TronScan Pro API — on-chain TRC-20 balances (e.g. USDT on Tron).
 * Docs: https://docs.tronscan.org/
 *
 * Set TRONSCAN_API_KEY in production .env (header: TRON-PRO-API-KEY).
 */

import axios from 'axios';

const TRONSCAN_BASE = 'https://apilist.tronscanapi.com/api';

/** Official USDT TRC-20 contract on Tron mainnet. */
export const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

type TronScanTrc20Row = {
  tokenId?: string;
  balance?: string | number;
  tokenDecimal?: number;
  amount?: number;
  tokenAbbr?: string;
};

function tronScanHeaders(): Record<string, string> {
  const key = process.env.TRONSCAN_API_KEY?.trim();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (key) headers['TRON-PRO-API-KEY'] = key;
  return headers;
}

export function isTronScanConfigured(): boolean {
  return Boolean(process.env.TRONSCAN_API_KEY?.trim());
}

/** DB may store Tatum symbol USDT_TRON instead of base58 contract address. */
export function resolveTronTokenContractAddress(contractAddress: string): string {
  const c = String(contractAddress ?? '').trim();
  if (!c || c.toUpperCase() === 'USDT_TRON') return USDT_TRC20_CONTRACT;
  return c;
}

function contractMatches(tokenId: string | undefined, want: string): boolean {
  if (!tokenId) return false;
  const a = want.trim().toLowerCase();
  const b = tokenId.trim().toLowerCase();
  return a === b;
}

function formatRawBalance(rawBalance: string | number, decimals: number): string {
  const rawStr = String(rawBalance).split('.')[0] || '0';
  const raw = BigInt(rawStr);
  const div = BigInt(10) ** BigInt(decimals);
  const whole = Number(raw) / Number(div);
  if (!Number.isFinite(whole)) return '0';
  return whole.toString();
}

function rowToHumanBalance(row: TronScanTrc20Row, fallbackDecimals: number): string {
  if (row.amount != null && Number.isFinite(row.amount)) {
    return String(row.amount);
  }
  if (row.balance == null) return '0';
  const decimals = row.tokenDecimal ?? fallbackDecimals;
  return formatRawBalance(row.balance, decimals);
}

/**
 * TRC-20 balance in human token units (e.g. USDT with 6 decimals).
 */
export async function getTronTrc20BalanceFromTronScan(
  holderAddress: string,
  contractAddress: string,
  decimals: number = 6
): Promise<string> {
  const want = resolveTronTokenContractAddress(contractAddress);

  const response = await axios.get(`${TRONSCAN_BASE}/account`, {
    headers: tronScanHeaders(),
    params: { address: holderAddress },
    timeout: 20000,
  });

  const rows = (response.data as { trc20token_balances?: TronScanTrc20Row[] }).trc20token_balances ?? [];
  for (const row of rows) {
    if (contractMatches(row.tokenId, want)) {
      return rowToHumanBalance(row, decimals);
    }
  }

  return '0';
}
