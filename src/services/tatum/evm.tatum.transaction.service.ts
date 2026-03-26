/**
 * Tatum v3 EVM sends (Ethereum, BSC, Polygon — same request shape as /v3/ethereum/transaction).
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';

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
    amount: params.amount.toString(),
    currency: params.currency.toUpperCase(),
    fromPrivateKey: params.fromPrivateKey,
  };
  if (params.gasPriceGwei && params.gasLimit) {
    body.fee = { gasPrice: params.gasPriceGwei.toString(), gasLimit: params.gasLimit.toString() };
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
