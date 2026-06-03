/**
 * Dual-balance helpers for VirtualAccount (virtual vs on-chain buckets).
 * availableBalance / accountBalance remain the combined total for backward compatibility.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { BalanceBucket } from '@prisma/client';
import { decimalFromBalance } from './crypto.unified.usdt';

export type VirtualAccountBalanceFields = {
  virtualBalance?: unknown;
  onChainBalance?: unknown;
  availableBalance?: unknown;
  accountBalance?: unknown;
};

export function getVirtualBalance(va: VirtualAccountBalanceFields): Decimal {
  return decimalFromBalance(va.virtualBalance);
}

export function getOnChainBalance(va: VirtualAccountBalanceFields): Decimal {
  const onChain = decimalFromBalance(va.onChainBalance);
  const virtual = getVirtualBalance(va);
  if (onChain.gt(0)) return onChain;
  if (virtual.gt(0)) return onChain;
  // Pre-dual-bucket or not yet split: treat legacy total as on-chain
  return decimalFromBalance(va.availableBalance ?? va.accountBalance);
}

export function getTotalBalance(va: VirtualAccountBalanceFields): Decimal {
  const virtual = getVirtualBalance(va);
  const onChain = getOnChainBalance(va);
  const fromBuckets = virtual.plus(onChain);
  if (fromBuckets.gt(0)) return fromBuckets;
  return decimalFromBalance(va.availableBalance ?? va.accountBalance);
}

export function syncTotalBalanceFields(
  virtualBalance: Decimal,
  onChainBalance: Decimal
): { virtualBalance: string; onChainBalance: string; availableBalance: string; accountBalance: string } {
  const total = virtualBalance.plus(onChainBalance);
  const totalStr = total.toString();
  return {
    virtualBalance: virtualBalance.toString(),
    onChainBalance: onChainBalance.toString(),
    availableBalance: totalStr,
    accountBalance: totalStr,
  };
}

export function allocateSellAmount(
  virtualAvailable: Decimal,
  onChainAvailable: Decimal,
  sellAmount: Decimal
): { virtualDebit: Decimal; onChainDebit: Decimal } {
  if (sellAmount.lte(0)) {
    return { virtualDebit: new Decimal('0'), onChainDebit: new Decimal('0') };
  }
  const total = virtualAvailable.plus(onChainAvailable);
  if (total.lt(sellAmount)) {
    throw new Error('Insufficient crypto balance');
  }
  const virtualDebit = Decimal.min(virtualAvailable, sellAmount);
  const onChainDebit = sellAmount.minus(virtualDebit);
  return { virtualDebit, onChainDebit };
}

export function allocateSellForAccount(
  va: VirtualAccountBalanceFields,
  sellAmount: Decimal
): { virtualDebit: Decimal; onChainDebit: Decimal; virtualAfter: Decimal; onChainAfter: Decimal } {
  const virtualAvailable = getVirtualBalance(va);
  const onChainAvailable = getOnChainBalance(va);
  const { virtualDebit, onChainDebit } = allocateSellAmount(virtualAvailable, onChainAvailable, sellAmount);
  return {
    virtualDebit,
    onChainDebit,
    virtualAfter: virtualAvailable.minus(virtualDebit),
    onChainAfter: onChainAvailable.minus(onChainDebit),
  };
}

export function creditBucketData(
  va: VirtualAccountBalanceFields,
  bucket: BalanceBucket,
  amount: Decimal
): ReturnType<typeof syncTotalBalanceFields> {
  if (amount.lte(0)) throw new Error('Credit amount must be positive');
  const virtual = getVirtualBalance(va);
  const onChain = getOnChainBalance(va);
  if (bucket === 'virtual') {
    return syncTotalBalanceFields(virtual.plus(amount), onChain);
  }
  return syncTotalBalanceFields(virtual, onChain.plus(amount));
}

export function debitBucketData(
  va: VirtualAccountBalanceFields,
  bucket: BalanceBucket,
  amount: Decimal
): ReturnType<typeof syncTotalBalanceFields> {
  if (amount.lte(0)) throw new Error('Debit amount must be positive');
  const virtual = getVirtualBalance(va);
  const onChain = getOnChainBalance(va);
  if (bucket === 'virtual') {
    if (virtual.lt(amount)) throw new Error('Insufficient virtual balance');
    return syncTotalBalanceFields(virtual.minus(amount), onChain);
  }
  if (onChain.lt(amount)) throw new Error('Insufficient on-chain balance');
  return syncTotalBalanceFields(virtual, onChain.minus(amount));
}

export function applyDualDebitData(
  va: VirtualAccountBalanceFields,
  virtualDebit: Decimal,
  onChainDebit: Decimal
): ReturnType<typeof syncTotalBalanceFields> {
  const virtual = getVirtualBalance(va);
  const onChain = getOnChainBalance(va);
  if (virtual.lt(virtualDebit) || onChain.lt(onChainDebit)) {
    throw new Error('Insufficient crypto balance');
  }
  return syncTotalBalanceFields(virtual.minus(virtualDebit), onChain.minus(onChainDebit));
}

export function makeSellBatchId(userId: number): string {
  return `SELL-BATCH-${Date.now()}-${userId}-${Math.random().toString(36).slice(2, 9)}`;
}

export function splitProportional(
  total: Decimal,
  part: Decimal,
  whole: Decimal
): Decimal {
  if (whole.lte(0)) return new Decimal('0');
  return total.mul(part).div(whole);
}
