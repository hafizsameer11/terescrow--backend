/**
 * Unified USDT: TRC20, ERC20, BEP20 share one logical balance for display / internal flows.
 * On-chain send still uses the network the user selects (per-virtual-account balance).
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export function isUsdtFamilyCurrency(currency: string): boolean {
  const c = (currency || '').toUpperCase();
  return c === 'USDT' || c.startsWith('USDT_');
}

/** App default for buy/sell/swap when frontend sends a single "USDT" product row. */
export function getDefaultUsdtBlockchain(): string {
  return (process.env.DEFAULT_USDT_BLOCKCHAIN || 'ethereum').toLowerCase();
}

/**
 * `virtual_account.currency` value for USDT on a given chain.
 */
export function usdtStorageCurrencyForBlockchain(blockchain: string): string {
  const b = blockchain.toLowerCase();
  if (b === 'tron') return 'USDT_TRON';
  if (b === 'ethereum' || b === 'eth') return 'USDT';
  if (b === 'bsc') return 'USDT_BSC';
  throw new Error(`Unsupported USDT network: ${blockchain}`);
}

export async function fetchUsdtFamilyVirtualAccounts(userId: number) {
  return prisma.virtualAccount.findMany({
    where: {
      userId,
      OR: [{ currency: 'USDT' }, { currency: { startsWith: 'USDT_' } }],
    },
    include: {
      walletCurrency: true,
      depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { id: 'asc' },
  });
}

export function sumUsdtBalances(accounts: { availableBalance?: unknown }[]): Decimal {
  return accounts.reduce(
    (s, a) => s.plus(new Decimal(a.availableBalance || '0')),
    new Decimal(0)
  );
}

export type UsdtNetworkBalance = {
  blockchain: string;
  storageCurrency: string;
  virtualAccountId: number;
  balance: string;
  depositAddress: string | null;
};

export function buildUsdtNetworkBalances(
  accounts: Awaited<ReturnType<typeof fetchUsdtFamilyVirtualAccounts>>
): UsdtNetworkBalance[] {
  return accounts.map((a) => ({
    blockchain: a.blockchain,
    storageCurrency: a.currency,
    virtualAccountId: a.id,
    balance: new Decimal(a.availableBalance || '0').toString(),
    depositAddress: a.depositAddresses[0]?.address ?? null,
  }));
}

/** Representative VA id for unified USDT row (default chain, else first). */
export function primaryUsdtVirtualAccountId(
  accounts: Awaited<ReturnType<typeof fetchUsdtFamilyVirtualAccounts>>
): number | null {
  if (!accounts.length) return null;
  const def = getDefaultUsdtBlockchain();
  const preferred = accounts.find((a) => a.blockchain.toLowerCase() === def);
  return (preferred ?? accounts[0]).id;
}

/** Resolve DB currency for send: UI sends USDT + network; ledger uses USDT / USDT_TRON / USDT_BSC. */
export function resolveSendStorageCurrency(normalizedCurrency: string, blockchain: string): string {
  const cur = normalizedCurrency.toUpperCase();
  if (cur === 'USDT') return usdtStorageCurrencyForBlockchain(blockchain);
  return cur;
}
