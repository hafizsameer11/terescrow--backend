/**
 * Tatum v3 Bitcoin — balance and broadcast from deposit address (private key / WIF).
 */

import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoLogger from '../../utils/crypto.logger';
import {
  formatTatumRequestError,
  formatTatumUtxoFeeAsNumericString,
  parseTatumUtxoAmountAsNumber,
} from '../utxo/utxo.tatum.service';

const baseUrl = 'https://api.tatum.io/v3';

function apiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

/** Spendable BTC at address (incoming − outgoing). */
export async function getBitcoinAddressBalanceBtc(address: string): Promise<string> {
  const endpoint = `${baseUrl}/bitcoin/address/balance/${encodeURIComponent(address)}`;
  const response = await axios.get<{ incoming?: string; outgoing?: string }>(endpoint, {
    headers: { 'x-api-key': apiKey(), accept: 'application/json' },
  });
  const incoming = new Decimal(response.data.incoming || '0');
  const outgoing = new Decimal(response.data.outgoing || '0');
  return incoming.minus(outgoing).toString();
}

/**
 * Recommended total transaction fee in BTC for a simple 1-in ~2-out transfer.
 * Tries Tatum fee endpoint; falls back to a conservative mainnet default.
 */
export async function estimateBitcoinTxFeeBtc(): Promise<Decimal> {
  try {
    const response = await axios.get(`${baseUrl}/blockchain/fee/BTC`, {
      headers: { 'x-api-key': apiKey(), accept: 'application/json' },
    });
    const d = response.data as any;
    const medium = d?.medium ?? d?.standard ?? d?.fast;
    if (medium != null) {
      const m = new Decimal(String(medium));
      if (m.isFinite() && m.gt(0) && m.lt(new Decimal('0.01'))) {
        return m;
      }
    }
  } catch (e) {
    cryptoLogger.warn('Tatum BTC fee estimate fallback', { e });
  }
  return new Decimal('0.000025');
}

export interface SendBitcoinFromAddressParams {
  fromAddress: string;
  fromPrivateKey: string;
  toAddress: string;
  /** Amount sent to recipient (BTC). */
  valueBtc: string;
  /** Miner fee (BTC). */
  feeBtc: string;
  /** Receives change (usually same as deposit). */
  changeAddress: string;
}

export async function sendBitcoinFromAddress(params: SendBitcoinFromAddressParams): Promise<string> {
  const body = {
    fromAddress: [
      {
        address: params.fromAddress,
        privateKey: params.fromPrivateKey,
      },
    ],
    to: [
      {
        address: params.toAddress,
        value: parseTatumUtxoAmountAsNumber(params.valueBtc),
      },
    ],
    fee: formatTatumUtxoFeeAsNumericString(params.feeBtc),
    changeAddress: params.changeAddress,
  };

  try {
    const response = await axios.post<{ txId: string }>(`${baseUrl}/bitcoin/transaction`, body, {
      headers: {
        'x-api-key': apiKey(),
        'content-type': 'application/json',
        accept: 'application/json',
      },
    });

    if (!response.data?.txId) {
      throw new Error('Bitcoin transaction: no txId in response');
    }
    return response.data.txId;
  } catch (e) {
    throw new Error(formatTatumRequestError(e));
  }
}
