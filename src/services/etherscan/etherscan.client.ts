import axios from 'axios';

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';

function apiKey(): string {
  return process.env.ETHERSCAN_API_KEY?.trim() || '';
}

export async function fetchEtherscanTransactionReceipt(
  chainId: number,
  txHash: string
): Promise<Record<string, unknown> | null> {
  const key = apiKey();
  if (!key) return null;

  const params = new URLSearchParams({
    chainid: String(chainId),
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txhash: txHash,
    apikey: key,
  });

  const response = await axios.get(`${ETHERSCAN_V2}?${params}`, {
    timeout: 20000,
    validateStatus: () => true,
  });

  const data = response.data as { status?: string; message?: string; result?: unknown };
  if (data.status === '0' && typeof data.result === 'string') {
    throw new Error(data.result);
  }
  if (data.result && typeof data.result === 'object') {
    return data.result as Record<string, unknown>;
  }
  return null;
}

export async function fetchEtherscanTransactionByHash(
  chainId: number,
  txHash: string
): Promise<Record<string, unknown> | null> {
  const key = apiKey();
  if (!key) return null;

  const params = new URLSearchParams({
    chainid: String(chainId),
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txhash: txHash,
    apikey: key,
  });

  const response = await axios.get(`${ETHERSCAN_V2}?${params}`, {
    timeout: 20000,
    validateStatus: () => true,
  });

  const data = response.data as { status?: string; result?: unknown };
  if (data.status === '0') return null;
  if (data.result && typeof data.result === 'object') {
    return data.result as Record<string, unknown>;
  }
  return null;
}

export function isEtherscanConfigured(): boolean {
  return Boolean(apiKey());
}
