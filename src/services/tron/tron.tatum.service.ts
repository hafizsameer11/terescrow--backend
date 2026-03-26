/**
 * Tatum v3 TRON — TRX and TRC-20 (e.g. USDT) sends + balance.
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';

const baseUrl = 'https://api.tatum.io/v3';

function apiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

/** TRX balance in TRX (human). */
export async function getTronTrxBalance(address: string): Promise<string> {
  const endpoint = `${baseUrl}/tron/account/${encodeURIComponent(address)}`;
  const response = await axios.get(endpoint, {
    headers: { 'x-api-key': apiKey(), accept: 'application/json' },
  });
  const d = response.data as any;
  if (d.balanceInTrx != null) return String(d.balanceInTrx);
  if (typeof d.balance === 'number') {
    return (Number(d.balance) / 1e6).toString();
  }
  if (typeof d.balance === 'string' && d.balance.includes('.')) {
    return d.balance;
  }
  if (d.balance != null) {
    return (Number(d.balance) / 1e6).toString();
  }
  return '0';
}

/**
 * TRC-20 balance (human units) for a contract — parses /tron/account trc20 list.
 * @param decimals usually 6 for USDT TRC20
 */
export async function getTronTrc20Balance(
  holderAddress: string,
  contractAddress: string,
  decimals: number = 6
): Promise<string> {
  const endpoint = `${baseUrl}/tron/account/${encodeURIComponent(holderAddress)}`;
  const response = await axios.get(endpoint, {
    headers: { 'x-api-key': apiKey(), accept: 'application/json' },
  });
  const d = response.data as any;
  const want = contractAddress.replace(/^0x/, '').toLowerCase();
  const trc20 = d.trc20;
  if (!Array.isArray(trc20)) return '0';
  for (const row of trc20) {
    if (row && typeof row === 'object') {
      for (const [k, v] of Object.entries(row)) {
        if (k.replace(/^0x/, '').toLowerCase() === want || k.toLowerCase() === contractAddress.toLowerCase()) {
          const raw = BigInt(String(v));
          const div = BigInt(10) ** BigInt(decimals);
          const whole = Number(raw) / Number(div);
          return whole.toString();
        }
      }
    }
  }
  return '0';
}

/** Send TRX (native). Amount in TRX. */
export async function sendTronTrx(params: {
  to: string;
  amountTrx: string;
  fromPrivateKey: string;
}): Promise<string> {
  const endpoint = `${baseUrl}/tron/transaction`;
  const body = {
    to: params.to,
    amount: params.amountTrx,
    fromPrivateKey: params.fromPrivateKey,
  };
  try {
    const response = await axios.post<{ txId?: string; transactionHash?: string }>(endpoint, body, {
      headers: { 'x-api-key': apiKey(), 'content-type': 'application/json', accept: 'application/json' },
    });
    const id = response.data.txId || response.data.transactionHash;
    if (!id) throw new Error('No tx id from Tatum Tron');
    return id;
  } catch (e: any) {
    cryptoLogger.exception('Tron TRX send', e, { apiResponse: e.response?.data });
    throw new Error(e.response?.data?.message || e.message || 'Tron TRX send failed');
  }
}

/** Send TRC-20 token. Amount in token units (human). feeLimit in TRX (energy cap). */
export async function sendTronTrc20(params: {
  to: string;
  amount: string;
  contractAddress: string;
  fromPrivateKey: string;
  feeLimitTrx?: number;
}): Promise<string> {
  const endpoint = `${baseUrl}/tron/trc20/transaction`;
  const body = {
    to: params.to,
    amount: params.amount,
    tokenAddress: params.contractAddress,
    fromPrivateKey: params.fromPrivateKey,
    feeLimit: params.feeLimitTrx ?? 50,
  };
  try {
    const response = await axios.post<{ txId?: string; transactionHash?: string }>(endpoint, body, {
      headers: { 'x-api-key': apiKey(), 'content-type': 'application/json', accept: 'application/json' },
    });
    const id = response.data.txId || response.data.transactionHash;
    if (!id) throw new Error('No tx id from Tatum Tron TRC20');
    return id;
  } catch (e: any) {
    cryptoLogger.exception('Tron TRC20 send', e, { apiResponse: e.response?.data });
    throw new Error(e.response?.data?.message || e.message || 'Tron TRC20 send failed');
  }
}
