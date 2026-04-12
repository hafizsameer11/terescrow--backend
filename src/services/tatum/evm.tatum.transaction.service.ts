/**
 * Tatum v3 EVM sends (Ethereum, BSC, Polygon — same request shape as /v3/ethereum/transaction).
 */

import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoLogger from '../../utils/crypto.logger';

/**
 * Tatum validates `amount` as a plain decimal string (^-?[0-9.]+). Values from Decimal.toString()
 * can use scientific notation for tiny amounts (e.g. 2.9e-7 ETH), which Tatum rejects.
 */
export function formatTatumEvmAmountString(amount: string | Decimal): string {
  const d = amount instanceof Decimal ? amount : new Decimal(String(amount).trim());
  if (!d.isFinite() || d.lte(0)) {
    throw new Error('EVM transaction amount must be a positive finite number');
  }
  const clipped = d.toDecimalPlaces(18, Decimal.ROUND_DOWN);
  if (clipped.lte(0)) {
    throw new Error('EVM transaction amount is too small (would round to zero at 18 decimal places)');
  }
  let s = clipped.toFixed(18);
  s = s.replace(/\.?0+$/, '');
  return s || '0';
}

export type EvmTatumPath = 'ethereum' | 'bsc' | 'polygon';

interface EvmTxRequest {
  to: string;
  amount: string;
  currency: string;
  fromPrivateKey: string;
  fee?: { gasPrice: string; gasLimit: string };
}

interface EvmTxResponse {
  txId: string;
}

const baseUrl = 'https://api.tatum.io/v3';

export async function sendEvmTatumTransaction(params: {
  evmPath: EvmTatumPath;
  to: string;
  amount: string;
  currency: string;
  fromPrivateKey: string;
  gasPriceGwei?: string;
  gasLimit?: string;
  testnet?: boolean;
}): Promise<string> {
  const apiKey = process.env.TATUM_API_KEY || '';
  if (!apiKey) throw new Error('TATUM_API_KEY is required');

  const testnet = params.testnet ?? false;
  const cleanTo = params.to.startsWith('0x') ? params.to : `0x${params.to}`;
  const segment = params.evmPath;

  let endpoint = `${baseUrl}/${segment}/transaction`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-api-key': apiKey,
  };

  if (segment === 'ethereum' && testnet) {
    endpoint = `${baseUrl}/ethereum/transaction?testnetType=ethereum-sepolia`;
    headers['x-testnet-type'] = 'ethereum-sepolia';
  }

  const body: EvmTxRequest = {
    to: cleanTo,
    amount: formatTatumEvmAmountString(params.amount),
    currency: params.currency.toUpperCase(),
    fromPrivateKey: params.fromPrivateKey,
  };
  if (params.gasPriceGwei && params.gasLimit) {
    const gp = String(params.gasPriceGwei).trim();
    const gl = String(params.gasLimit).trim();
    body.fee = {
      gasPrice: /e|E/.test(gp) ? new Decimal(gp).toFixed(0) : gp,
      gasLimit: /e|E/.test(gl) ? new Decimal(gl).toFixed(0) : gl,
    };
  }

  try {
    cryptoLogger.apiCall('Tatum', endpoint, { to: cleanTo, currency: body.currency, evmPath: segment });
    const response = await axios.post<EvmTxResponse>(endpoint, body, { headers });
    if (!response.data.txId) {
      throw new Error('Transaction failed: No transaction ID returned');
    }
    return response.data.txId;
  } catch (error: any) {
    cryptoLogger.exception('Send EVM Tatum transaction', error, {
      endpoint,
      evmPath: segment,
      apiResponse: error.response?.data,
    });
    throw new Error(`Failed to send transaction: ${error.response?.data?.message || error.message}`);
  }
}
