/**
 * Native + BEP20/ERC20 balances via Tatum v3 for EVM chains used in disbursements.
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';
import type { EvmTatumPath } from './evm.tatum.transaction.service';

const baseUrl = 'https://api.tatum.io/v3';

function getApiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

/** Parse Tatum balance response (wei or decimal ETH/BNB). */
function parseNativeBalance(raw: string): string {
  if (raw.includes('.')) {
    return String(parseFloat(raw));
  }
  const wei = BigInt(raw);
  return (Number(wei) / 1e18).toString();
}

export async function getEvmNativeBalance(
  evmPath: EvmTatumPath,
  address: string,
  testnet: boolean = false
): Promise<string> {
  const clean = address.startsWith('0x') ? address : `0x${address}`;
  let endpoint: string;
  if (evmPath === 'ethereum') {
    endpoint = testnet
      ? `${baseUrl}/ethereum/account/balance/${clean}?testnetType=ethereum-sepolia`
      : `${baseUrl}/ethereum/account/balance/${clean}`;
  } else if (evmPath === 'bsc') {
    endpoint = `${baseUrl}/bsc/account/balance/${clean}`;
  } else {
    endpoint = `${baseUrl}/polygon/account/balance/${clean}`;
  }

  const headers: Record<string, string> = {
    'x-api-key': getApiKey(),
    accept: 'application/json',
    ...(testnet && evmPath === 'ethereum' ? { 'x-testnet-type': 'ethereum-sepolia' } : {}),
  };

  const response = await axios.get<{ balance: string }>(endpoint, { headers });
  const bal = parseNativeBalance(response.data.balance);
  cryptoLogger.balanceCheck(clean, bal, evmPath.toUpperCase(), { testnet });
  return bal;
}

/** ERC-20 / BEP-20 balance for Ethereum (ETH chain) or BSC. */
export async function getEvmFungibleTokenBalance(
  evmPath: EvmTatumPath,
  contractAddress: string,
  walletAddress: string,
  testnet: boolean = false
): Promise<string> {
  const cleanWallet = walletAddress.startsWith('0x') ? walletAddress : `0x${walletAddress}`;
  const contract = contractAddress.toLowerCase();

  if (evmPath === 'ethereum') {
    const chain = testnet ? 'ETH_SEPOLIA' : 'ETH';
    const endpoint = `${baseUrl}/blockchain/token/address/${chain}/${cleanWallet}`;
    const response = await axios.get<Array<{ contractAddress: string; amount: string }>>(endpoint, {
      headers: { 'x-api-key': getApiKey(), accept: 'application/json' },
    });
    const row = response.data.find((t) => t.contractAddress.toLowerCase() === contract);
    return row?.amount ?? '0';
  }

  if (evmPath === 'bsc') {
    const enc = encodeURIComponent(contractAddress);
    const encW = encodeURIComponent(cleanWallet);
    const endpoint = `${baseUrl}/bsc/erc20/balance/${enc}/${encW}`;
    const response = await axios.get<{ balance: string }>(endpoint, {
      headers: { 'x-api-key': getApiKey(), accept: 'application/json' },
    });
    return response.data.balance || '0';
  }

  const chain = testnet ? 'MATIC_AMOY' : 'MATIC';
  const endpoint = `${baseUrl}/blockchain/token/address/${chain}/${cleanWallet}`;
  const response = await axios.get<Array<{ contractAddress: string; amount: string }>>(endpoint, {
    headers: { 'x-api-key': getApiKey(), accept: 'application/json' },
  });
  const row = response.data.find((t) => t.contractAddress.toLowerCase() === contract);
  return row?.amount ?? '0';
}
