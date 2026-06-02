/**
 * Shared on-chain balance reads for admin / disbursement flows.
 * Tron TRC-20 (USDT) uses TronScan via getTronTrc20Balance when configured.
 */

import tatumService from '../tatum/tatum.service';
import { getTronTrc20Balance, getTronTrxBalance } from '../tron/tron.tatum.service';

function chainKey(blockchain: string): string {
  return String(blockchain ?? '').toLowerCase().trim();
}

export async function fetchOnChainTokenBalance(params: {
  blockchain: string;
  address: string;
  contractAddress?: string | null;
  decimals?: number | null;
  isToken?: boolean | null;
}): Promise<string> {
  const chain = chainKey(params.blockchain);
  const address = String(params.address ?? '').trim();
  if (!address) return '0';

  if (!params.isToken) {
    if (chain === 'tron' || chain === 'trx') {
      try {
        return await getTronTrxBalance(address);
      } catch {
        return '0';
      }
    }
    try {
      const bal = await tatumService.getAddressBalance(params.blockchain, address, false);
      return bal?.balance != null ? String(bal.balance) : '0';
    } catch {
      return '0';
    }
  }

  if (chain === 'tron' || chain === 'trx') {
    if (!params.contractAddress) return '0';
    try {
      return await getTronTrc20Balance(address, params.contractAddress, params.decimals ?? 6);
    } catch {
      return '0';
    }
  }

  try {
    const tokens = await tatumService.getSupportedTokenBalances(params.blockchain, address);
    const match = (tokens ?? []).find(
      (t: { contractAddress?: string }) =>
        t.contractAddress &&
        params.contractAddress &&
        String(t.contractAddress).toLowerCase() === String(params.contractAddress).toLowerCase()
    );
    return match?.amount != null ? String(match.amount) : '0';
  } catch {
    return '0';
  }
}
