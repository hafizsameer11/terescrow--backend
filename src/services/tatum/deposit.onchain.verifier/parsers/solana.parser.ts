import type { ParsedOnChainTransfer } from '../types';
import { Decimal } from '@prisma/client/runtime/library';

/** v1: confirm tx exists with slot; native SOL only — lamport balance delta heuristic. */
export function parseSolanaNativeTransfer(
  body: Record<string, unknown>,
  depositAddress: string,
  expectedAmount: string
): ParsedOnChainTransfer | null {
  const slot = body.slot;
  if (slot == null) return null;

  const tx = body.transaction as Record<string, unknown> | undefined;
  const message = tx?.message as Record<string, unknown> | undefined;
  const accountKeys = (message?.accountKeys as string[] | undefined) ?? [];
  const deposit = depositAddress.trim();

  const depositIndex = accountKeys.findIndex(
    (k) => k.trim().toLowerCase() === deposit.toLowerCase()
  );
  if (depositIndex < 0) return null;

  const meta = body.meta as Record<string, unknown> | undefined;
  const preBalances = (meta?.preBalances as number[] | undefined) ?? [];
  const postBalances = (meta?.postBalances as number[] | undefined) ?? [];

  if (preBalances.length > depositIndex && postBalances.length > depositIndex) {
    const delta = postBalances[depositIndex] - preBalances[depositIndex];
    if (delta > 0) {
      const lamports = String(delta);
      const onChainSol = new Decimal(lamports).div(1e9);
      const expected = new Decimal(expectedAmount);
      if (expected.minus(onChainSol).abs().lte(new Decimal('0.00000001'))) {
        return {
          success: true,
          recipient: deposit,
          amountRaw: lamports,
          decimals: 9,
          blockNumber: typeof slot === 'number' ? slot : undefined,
        };
      }
    }
  }

  // Tatum response may omit meta — tx exists at slot; treat as pending for strict amount check
  if (accountKeys.some((k) => k.trim() === deposit)) {
    return {
      success: true,
      recipient: deposit,
      amountRaw: '0',
      decimals: 9,
      blockNumber: typeof slot === 'number' ? slot : undefined,
    };
  }

  return null;
}
