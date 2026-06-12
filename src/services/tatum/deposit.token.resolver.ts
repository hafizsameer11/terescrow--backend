import { prisma } from '../../utils/prisma';
import type { WalletCurrency } from '@prisma/client';

/** 40-hex EVM contract id, lowercase with 0x. */
export function canonicalEvmContract(addr: string): string | null {
  const t = addr.trim().toLowerCase();
  const hex = t.startsWith('0x') ? t.slice(2) : t;
  if (!/^[0-9a-f]{40}$/.test(hex)) return null;
  return `0x${hex}`;
}

export function tokenContractMatches(dbContract: string, webhookContract: string): boolean {
  const db = dbContract.trim();
  const inc = webhookContract.trim();
  const dbEvm = canonicalEvmContract(db);
  const incEvm = canonicalEvmContract(inc);
  if (dbEvm && incEvm) return dbEvm === incEvm;
  if (db.toLowerCase() === inc.toLowerCase()) return true;
  return db === inc;
}

/** wallet_currencies.blockchain casing differs from virtual_account (e.g. Ethereum vs ethereum). */
export function blockchainDbVariants(slug: string): string[] {
  const s = slug.toLowerCase();
  const variants = new Set<string>([s]);
  if (s === 'ethereum') variants.add('Ethereum');
  if (s === 'bsc') variants.add('BSC');
  if (s === 'polygon') variants.add('Polygon');
  if (s === 'tron') variants.add('Tron');
  return [...variants];
}

export interface ResolveWalletCurrencyOptions {
  /** When false, only exact contractAddress matches count (no currency ticker fallback). */
  allowTickerFallback?: boolean;
}

/** Resolve whitelisted wallet currency from on-chain contract / Tatum asset id. */
export async function resolveWalletCurrencyFromContract(
  chainSlug: string,
  contractAddress: string,
  options?: ResolveWalletCurrencyOptions
): Promise<WalletCurrency | null> {
  const allowTickerFallback = options?.allowTickerFallback !== false;

  const walletCurrencies = await prisma.walletCurrency.findMany({
    where: {
      blockchain: { in: blockchainDbVariants(chainSlug) },
      contractAddress: { not: null },
    },
  });

  const walletCurrency = walletCurrencies.find(
    (wc) => wc.contractAddress && tokenContractMatches(wc.contractAddress, contractAddress)
  );
  if (walletCurrency) return walletCurrency;

  if (!allowTickerFallback) return null;

  return (
    walletCurrencies.find(
      (wc) => wc.currency.toUpperCase() === String(contractAddress).toUpperCase()
    ) ?? null
  );
}
