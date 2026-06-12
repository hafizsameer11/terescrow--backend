import type { ParsedOnChainTransfer } from '../types';
import { utxoAmountsMatch } from '../amount.compare';

type UtxoOutput = { address?: string | null; value?: number | string };

export function parseUtxoOutputs(
  body: Record<string, unknown>,
  depositAddress: string
): ParsedOnChainTransfer | null {
  if (body.blockNumber == null && body.block_number == null) {
    return null;
  }

  const outputs = (body.outputs as UtxoOutput[] | undefined) ?? [];
  const deposit = depositAddress.trim();
  let totalSat = 0;

  for (const out of outputs) {
    const addr = String(out.address ?? '').trim();
    if (!addr || addr.toLowerCase() !== deposit.toLowerCase()) continue;
    totalSat += Number(out.value ?? 0);
  }

  if (totalSat <= 0) return null;

  return {
    success: true,
    recipient: deposit,
    amountRaw: String(totalSat),
    decimals: 8,
    blockNumber:
      typeof body.blockNumber === 'number'
        ? body.blockNumber
        : typeof body.block_number === 'number'
          ? body.block_number
          : undefined,
  };
}

export function validateUtxoTransfer(
  parsed: ParsedOnChainTransfer | null,
  expectedAmount: string
): { ok: true } | { ok: false; reason: string } {
  if (!parsed) return { ok: false, reason: 'transfer_not_found_on_chain' };
  if (!parsed.success) return { ok: false, reason: 'transaction_failed' };
  if (!utxoAmountsMatch(expectedAmount, parsed.amountRaw)) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  return { ok: true };
}
