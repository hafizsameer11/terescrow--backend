import type { ParsedOnChainTransfer } from '../types';
import { amountsMatch, addressesEqual } from '../amount.compare';
import { tokenContractMatches } from '../../deposit.token.resolver';

type Trc20Row = {
  contract_address?: string;
  to_address?: string;
  from_address?: string;
  amount_str?: string;
  decimals?: number;
  type?: string;
};

export function parseTronScanTransactionInfo(
  body: Record<string, unknown>,
  depositAddress: string,
  whitelistedContract: string,
  isToken: boolean
): ParsedOnChainTransfer | null {
  const contractRet = String(body.contractRet ?? '');
  if (contractRet && contractRet !== 'SUCCESS') {
    return { success: false, recipient: '', amountRaw: '0' };
  }

  if (isToken) {
    const rows = (body.trc20TransferInfo as Trc20Row[] | undefined) ?? [];
    for (const row of rows) {
      const contract = String(row.contract_address ?? '');
      if (!tokenContractMatches(whitelistedContract, contract)) continue;
      const to = String(row.to_address ?? '');
      if (!addressesEqual(to, depositAddress, 'tron')) continue;
      if (row.type && row.type !== 'Transfer') continue;

      const decimals = row.decimals ?? 6;
      return {
        success: true,
        recipient: to,
        amountRaw: String(row.amount_str ?? '0'),
        contractAddress: contract,
        decimals,
        blockNumber: typeof body.block === 'number' ? body.block : undefined,
      };
    }
    return null;
  }

  const to = String(body.toAddress ?? body.to_address ?? '');
  if (!addressesEqual(to, depositAddress, 'tron')) return null;

  const contractData = body.contractData as { amount?: unknown } | undefined;
  const amount = body.amount ?? contractData?.amount;
  return {
    success: true,
    recipient: to,
    amountRaw: String(amount ?? '0'),
    decimals: 6,
    blockNumber: typeof body.block === 'number' ? body.block : undefined,
  };
}

export function validateTronTransfer(
  parsed: ParsedOnChainTransfer | null,
  expectedAmount: string,
  whitelistedContract: string,
  isToken: boolean
): { ok: true } | { ok: false; reason: string } {
  if (!parsed) return { ok: false, reason: 'transfer_not_found_on_chain' };
  if (!parsed.success) return { ok: false, reason: 'transaction_failed' };
  if (isToken && parsed.contractAddress && !tokenContractMatches(whitelistedContract, parsed.contractAddress)) {
    return { ok: false, reason: 'contract_mismatch' };
  }
  const decimals = parsed.decimals ?? 6;
  if (!amountsMatch(expectedAmount, parsed.amountRaw, decimals)) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  return { ok: true };
}
