/**
 * Resolve internal WalletCurrency → ChangeNOW v2 ticker.
 * Prefer DB mapping (`WalletCurrencyChangeNowTicker`); fallback to known contracts/chains.
 */

import { prisma } from '../../utils/prisma';

const ERC20_USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const ERC20_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BEP20_USDT = '0x55d398326f99059ff775485246999027b3197955';
const TRON_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

function normChain(b: string): string {
  return String(b || '')
    .trim()
    .toLowerCase();
}

function normAddr(a: string | null | undefined): string | null {
  if (!a) return null;
  return a.trim().toLowerCase();
}

/** Fallback ticker when no DB row exists */
export function fallbackChangeNowTicker(wc: {
  blockchain: string;
  currency: string;
  contractAddress: string | null;
  isToken: boolean;
}): string {
  const chain = normChain(wc.blockchain);
  const cur = wc.currency.toUpperCase();
  const ca = normAddr(wc.contractAddress);

  if (chain === 'bitcoin' && cur === 'BTC' && !wc.isToken) return 'btc';
  if (chain === 'ethereum' && cur === 'ETH' && !wc.isToken) return 'eth';
  if (chain === 'bsc' && (cur === 'BNB' || cur === 'BSC') && !wc.isToken) return 'bnbbsc';
  if (chain === 'polygon' && cur === 'MATIC' && !wc.isToken) return 'maticmainnet';
  if (chain === 'tron' && (cur === 'TRX' || cur === 'TRON') && !wc.isToken) return 'trx';

  // v2 API expects `usdt` + network `eth` (see normalizeLegacyTickersForV2); avoid legacy `usdterc20` ticker.
  if (ca === ERC20_USDT && chain === 'ethereum') return 'usdt';
  if (ca === ERC20_USDC && chain === 'ethereum') return 'usdc';
  if (ca === BEP20_USDT && chain === 'bsc') return 'usdtbsc';
  if (wc.contractAddress && wc.contractAddress.toUpperCase() === TRON_USDT && chain === 'tron')
    return 'usdttrc20';
  if (cur === 'USDT_TRON' && chain === 'tron') return 'usdttrc20';
  if (cur === 'USDT_BSC' && chain === 'bsc') return 'usdtbsc';

  return cur.toLowerCase();
}

export async function resolveTickerForWalletCurrencyId(walletCurrencyId: number): Promise<string> {
  const wc = await prisma.walletCurrency.findUnique({
    where: { id: walletCurrencyId },
    include: { changeNowTicker: true },
  });
  if (!wc) {
    throw new Error(`WalletCurrency ${walletCurrencyId} not found`);
  }
  if (wc.changeNowTicker?.changenowTicker) {
    return wc.changeNowTicker.changenowTicker;
  }
  return fallbackChangeNowTicker(wc);
}

export async function listWalletCurrenciesWithTickers() {
  const rows = await prisma.walletCurrency.findMany({
    orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    include: { changeNowTicker: true },
  });
  return rows.map((wc) => ({
    id: wc.id,
    blockchain: wc.blockchain,
    currency: wc.currency,
    contractAddress: wc.contractAddress,
    isToken: wc.isToken,
    changenowTicker:
      wc.changeNowTicker?.changenowTicker ?? fallbackChangeNowTicker(wc),
    mappingSource: wc.changeNowTicker ? 'database' : 'fallback',
  }));
}

export async function upsertTickerMapping(walletCurrencyId: number, changenowTicker: string) {
  return prisma.walletCurrencyChangeNowTicker.upsert({
    where: { walletCurrencyId },
    create: { walletCurrencyId, changenowTicker: changenowTicker.trim() },
    update: { changenowTicker: changenowTicker.trim() },
  });
}
