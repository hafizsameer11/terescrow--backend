/**
 * Tatum v3 Solana — balance and native SOL transfer from one keypair.
 */

import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoLogger from '../../utils/crypto.logger';
import { formatTatumRequestError } from '../utxo/utxo.tatum.service';

const baseUrl = 'https://api.tatum.io/v3';

function apiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

/** Interpret Tatum account balance as SOL (handles lamport-sized integers). */
export function parseTatumSolBalance(raw: string | number | undefined | null): Decimal {
  if (raw === undefined || raw === null) return new Decimal(0);
  const s = String(raw).trim();
  if (!s) return new Decimal(0);
  if (s.includes('.') || /[eE]/.test(s)) {
    return new Decimal(s);
  }
  const d = new Decimal(s);
  if (!d.isFinite()) return new Decimal(0);
  if (d.abs().lt(1e6)) {
    return d;
  }
  return d.div(1e9);
}

/** Native SOL balance via Tatum v3 `GET /v3/solana/account/balance/{address}` (not `/account/{address}`). */
export async function getSolanaAddressBalanceSol(address: string): Promise<string> {
  try {
    const endpoint = `${baseUrl}/solana/account/balance/${encodeURIComponent(address)}`;
    const response = await axios.get(endpoint, {
      headers: { 'x-api-key': apiKey(), accept: 'application/json' },
    });
    const data = response.data as Record<string, unknown>;
    const candidates = [
      data.balance,
      (data.account as Record<string, unknown> | undefined)?.balance,
      (data.data as Record<string, unknown> | undefined)?.balance,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        return parseTatumSolBalance(c as string | number).toString();
      }
    }
    cryptoLogger.warn('Solana balance response missing balance field', { address, keys: Object.keys(data) });
    return '0';
  } catch (e) {
    throw new Error(`Solana balance (Tatum): ${formatTatumRequestError(e)}`);
  }
}

export async function estimateSolanaTransferFeeSol(): Promise<Decimal> {
  try {
    const response = await axios.get(`${baseUrl}/blockchain/fee/SOL`, {
      headers: { 'x-api-key': apiKey(), accept: 'application/json' },
    });
    const d = response.data as { medium?: string; standard?: string; fast?: string };
    const medium = d?.medium ?? d?.standard ?? d?.fast;
    if (medium != null) {
      const m = new Decimal(String(medium));
      if (m.isFinite() && m.gt(0) && m.lt(1)) {
        return m;
      }
    }
  } catch (e) {
    cryptoLogger.warn('Tatum SOL fee estimate fallback', { e });
  }
  return new Decimal('0.00005');
}

export interface SendSolFromAddressParams {
  fromAddress: string;
  fromPrivateKey: string;
  toAddress: string;
  /** Amount of SOL delivered to `toAddress`. */
  amountSol: string;
}

const TATUM_SOL_AMOUNT_MIN = new Decimal('1e-9');

/**
 * Tatum `POST /v3/solana/transaction` expects `amount` as a **numeric string**
 * (not a JSON number), ≥ 1e-9 SOL, max 9 decimal places.
 */
export function formatTatumSolAmountAsNumericString(amountSol: string): string {
  const d = new Decimal(String(amountSol).trim());
  if (!d.isFinite() || d.lte(0)) {
    throw new Error('Solana send amount must be a positive number');
  }
  const clipped = d.toDecimalPlaces(9, Decimal.ROUND_DOWN);
  if (clipped.lt(TATUM_SOL_AMOUNT_MIN)) {
    throw new Error('Solana send amount must be at least 1e-9 SOL');
  }
  let s = clipped.toFixed(9);
  if (s.includes('.')) {
    s = s.replace(/\.?0+$/, '');
  }
  return s;
}

export async function sendSolFromAddress(params: SendSolFromAddressParams): Promise<string> {
  const body = {
    from: params.fromAddress,
    to: params.toAddress,
    amount: formatTatumSolAmountAsNumericString(params.amountSol),
    fromPrivateKey: params.fromPrivateKey.trim(),
  };

  try {
    const response = await axios.post<{ txId?: string; signature?: string }>(
      `${baseUrl}/solana/transaction`,
      body,
      {
        headers: {
          'x-api-key': apiKey(),
          'content-type': 'application/json',
          accept: 'application/json',
        },
      }
    );

    const id = response.data?.txId || response.data?.signature;
    if (!id) {
      throw new Error('Solana transaction: no txId/signature in response');
    }
    return id;
  } catch (e) {
    if (e instanceof Error && e.message.includes('no txId')) throw e;
    throw new Error(`Solana send (Tatum): ${formatTatumRequestError(e)}`);
  }
}
