import { canonicalEvmContract } from '../../deposit.token.resolver';
import type { ParsedOnChainTransfer } from '../types';
import {
  TRANSFER_TOPIC,
  amountsMatch,
  evmTxSucceeded,
  normalizeEvmAddress,
  parseHexValue,
  topicToAddress,
} from '../amount.compare';

type EvmLog = {
  address?: string;
  topics?: string[];
  data?: string;
};

export function parseEvmTokenTransferFromTatum(
  body: Record<string, unknown>,
  depositAddress: string,
  whitelistedContract: string
): ParsedOnChainTransfer | null {
  if (!evmTxSucceeded(body.status)) {
    return { success: false, recipient: '', amountRaw: '0' };
  }

  const wantContract = canonicalEvmContract(whitelistedContract);
  const logs = (body.logs as EvmLog[] | undefined) ?? [];
  const deposit = normalizeEvmAddress(depositAddress);

  for (const log of logs) {
    const logContract = canonicalEvmContract(String(log.address ?? ''));
    if (!logContract || !wantContract || logContract !== wantContract) continue;
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topics.length < 3) continue;

    const recipient = topicToAddress(topics[2]);
    if (normalizeEvmAddress(recipient) !== deposit) continue;

    const data = log.data ?? '0x0';
    const amountRaw = parseHexValue(data).toString();
    return {
      success: true,
      recipient,
      amountRaw,
      contractAddress: logContract,
      blockNumber: typeof body.blockNumber === 'number' ? body.blockNumber : undefined,
    };
  }

  return null;
}

export function parseEvmTokenTransferFromReceipt(
  receipt: Record<string, unknown>,
  depositAddress: string,
  whitelistedContract: string
): ParsedOnChainTransfer | null {
  if (!evmTxSucceeded(receipt.status)) {
    return { success: false, recipient: '', amountRaw: '0' };
  }

  const wantContract = canonicalEvmContract(whitelistedContract);
  const logs = (receipt.logs as EvmLog[] | undefined) ?? [];
  const deposit = normalizeEvmAddress(depositAddress);

  for (const log of logs) {
    const logContract = canonicalEvmContract(String(log.address ?? ''));
    if (!logContract || !wantContract || logContract !== wantContract) continue;
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topics.length < 3) continue;

    const recipient = topicToAddress(topics[2]);
    if (normalizeEvmAddress(recipient) !== deposit) continue;

    const amountRaw = parseHexValue(log.data ?? '0x0').toString();
    return {
      success: true,
      recipient,
      amountRaw,
      contractAddress: logContract,
      blockNumber: receipt.blockNumber ? Number(parseHexValue(receipt.blockNumber)) : undefined,
    };
  }

  return null;
}

export function parseEvmNativeTransfer(
  body: Record<string, unknown>,
  depositAddress: string
): ParsedOnChainTransfer | null {
  if (!evmTxSucceeded(body.status)) {
    return { success: false, recipient: '', amountRaw: '0' };
  }

  const to = normalizeEvmAddress(String(body.to ?? ''));
  const deposit = normalizeEvmAddress(depositAddress);
  if (to !== deposit) return null;

  const value = parseHexValue(body.value ?? '0');
  if (value <= BigInt(0)) return null;

  return {
    success: true,
    recipient: to,
    amountRaw: value.toString(),
    blockNumber: typeof body.blockNumber === 'number' ? body.blockNumber : undefined,
    decimals: 18,
  };
}

export function validateEvmTransfer(
  parsed: ParsedOnChainTransfer | null,
  expectedAmount: string,
  decimals: number
): { ok: true } | { ok: false; reason: string } {
  if (!parsed) return { ok: false, reason: 'transfer_not_found_on_chain' };
  if (!parsed.success) return { ok: false, reason: 'transaction_reverted' };
  if (!amountsMatch(expectedAmount, parsed.amountRaw, decimals)) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  return { ok: true };
}
