/**
 * Tatum v3 UTXO chains — balance, fee estimate, broadcast from one address + private key.
 * Used for customer sends from deposit addresses (same pattern as bitcoin.tatum.service).
 */

import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoLogger from '../../utils/crypto.logger';

const baseUrl = 'https://api.tatum.io/v3';

export type UtxoTatumChain = 'bitcoin' | 'dogecoin' | 'litecoin';

function apiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

function segment(chain: UtxoTatumChain): string {
  return chain;
}

/** Spendable balance at address (incoming − outgoing), human units. */
export async function getUtxoAddressBalance(chain: UtxoTatumChain, address: string): Promise<string> {
  const endpoint = `${baseUrl}/${segment(chain)}/address/balance/${encodeURIComponent(address)}`;
  const response = await axios.get<{ incoming?: string; outgoing?: string }>(endpoint, {
    headers: { 'x-api-key': apiKey(), accept: 'application/json' },
  });
  const incoming = new Decimal(response.data.incoming || '0');
  const outgoing = new Decimal(response.data.outgoing || '0');
  return incoming.minus(outgoing).toString();
}

/** Tatum fee ticker symbol for /v3/blockchain/fee/{symbol} */
function feeTicker(chain: UtxoTatumChain): string {
  if (chain === 'bitcoin') return 'BTC';
  if (chain === 'dogecoin') return 'DOGE';
  return 'LTC';
}

export async function estimateUtxoTxFee(chain: UtxoTatumChain): Promise<Decimal> {
  const ticker = feeTicker(chain);
  try {
    const response = await axios.get(`${baseUrl}/blockchain/fee/${ticker}`, {
      headers: { 'x-api-key': apiKey(), accept: 'application/json' },
    });
    const d = response.data as any;
    const medium = d?.medium ?? d?.standard ?? d?.fast;
    if (medium != null) {
      const m = new Decimal(String(medium));
      if (m.isFinite() && m.gt(0)) {
        const cap = chain === 'bitcoin' ? new Decimal('0.01') : new Decimal('100');
        if (m.lt(cap)) return m;
      }
    }
  } catch (e) {
    cryptoLogger.warn(`Tatum ${ticker} fee estimate fallback`, { e });
  }
  if (chain === 'bitcoin') return new Decimal('0.000025');
  if (chain === 'dogecoin') return new Decimal('1');
  return new Decimal('0.0001');
}

export interface SendUtxoFromAddressParams {
  chain: UtxoTatumChain;
  fromAddress: string;
  fromPrivateKey: string;
  toAddress: string;
  value: string;
  fee: string;
  changeAddress: string;
}

export async function sendUtxoFromAddress(params: SendUtxoFromAddressParams): Promise<string> {
  const { chain } = params;
  const body = {
    fromAddress: [
      {
        address: params.fromAddress,
        privateKey: params.fromPrivateKey,
      },
    ],
    to: [{ address: params.toAddress, value: params.value }],
    fee: params.fee,
    changeAddress: params.changeAddress,
  };

  const response = await axios.post<{ txId: string }>(`${baseUrl}/${segment(chain)}/transaction`, body, {
    headers: {
      'x-api-key': apiKey(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
  });

  if (!response.data?.txId) {
    throw new Error(`${chain} transaction: no txId in response`);
  }
  return response.data.txId;
}
