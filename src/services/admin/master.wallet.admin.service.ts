import { prisma } from '../../utils/prisma';
import tatumService from '../tatum/tatum.service';
import { getTronTrc20Balance, getTronTrxBalance } from '../tron/tron.tatum.service';
import {
  estimateMasterWalletSend,
  executeMasterWalletOnChainSend,
  type MasterWalletSendEstimate,
} from './master.wallet.outbound.service';

export { estimateMasterWalletSend, type MasterWalletSendEstimate };

const mwTxModel = (prisma as any).masterWalletTransaction;

function chainKey(blockchain: string): string {
  return String(blockchain ?? '').toLowerCase().trim();
}

/** Client-friendly label, e.g. "USDT (Tron)". */
function formatDisplayLabel(currency: string, blockchain: string): string {
  const c = String(currency ?? '').trim();
  const b = String(blockchain ?? '').trim();
  if (!c) return b || '—';
  if (!b) return c;
  const chainLabel =
    b.length <= 4 ? b.toUpperCase() : b.charAt(0).toUpperCase() + b.slice(1).toLowerCase();
  return `${c} (${chainLabel})`;
}

function formatChainName(blockchain: string): string {
  const b = String(blockchain ?? '').trim();
  if (!b) return 'this network';
  return b.length <= 4 ? b.toUpperCase() : b.charAt(0).toUpperCase() + b.slice(1).toLowerCase();
}

export interface BalanceSummaryItem {
  walletId: string;
  label: string;
  totalUsd: number;
  totalNgn: number;
  totalBtc?: number;
  accountName?: string;
  accountNumber?: string;
}

export interface AssetItem {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number;
  address?: string;
  blockchain?: string;
  currency?: string;
  walletCurrencyId?: number;
  isToken?: boolean;
  /** e.g. "USDT (Tron)" — shown per coin even when address is shared with native chain asset */
  displayLabel?: string;
  /** Explains same on-chain address as native coin (for non-crypto-savvy admins) */
  sharedMasterWalletNote?: string;
  tercescrowBalance?: string;
  tercescrowUsd?: number;
}

export interface MasterWalletTxItem {
  id: number;
  to: string | null;
  status: string;
  type: string;
  wallet: string;
  amount: string;
  date: string;
  assetSymbol: string;
  walletId: string;
}

export async function getMasterWalletBalanceSummary(): Promise<BalanceSummaryItem[]> {
  const [wallets, currencies] = await Promise.all([
    prisma.masterWallet.findMany(),
    prisma.walletCurrency.findMany({ where: { isToken: false } }),
  ]);
  let totalUsd = 0;
  let totalNgn = 0;
  let totalBtc = 0;

  for (const w of wallets) {
    if (!w.address) continue;
    const wc = currencies.find((c) => c.blockchain === w.blockchain);
    const usdPrice = wc?.price ? Number(wc.price) : 0;
    const nairaPrice = wc?.nairaPrice ? Number(wc.nairaPrice) : 0;
    try {
      const balance = await tatumService.getAddressBalance(w.blockchain, w.address, false);
      if (balance?.balance !== undefined) {
        const bal = parseFloat(String(balance.balance));
        totalUsd += bal * usdPrice;
        totalNgn += bal * nairaPrice;
        if (w.blockchain?.toLowerCase() === 'bitcoin') totalBtc += bal;
      }
    } catch (_) {
      // skip
    }
  }

  return [
    {
      walletId: 'tercescrow',
      label: 'Tercescrow',
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalNgn: Math.round(totalNgn * 100) / 100,
      totalBtc: totalBtc > 0 ? Math.round(totalBtc * 1e8) / 1e8 : undefined,
    },
    {
      walletId: 'yellowcard',
      label: 'Yellow Card',
      totalUsd: 0,
      totalNgn: 0,
    },
    {
      walletId: 'palmpay',
      label: 'Palmpay',
      totalUsd: 0,
      totalNgn: 0,
      accountName: undefined,
      accountNumber: undefined,
    },
  ];
}

async function fetchTokenBalanceForCurrency(
  blockchain: string,
  address: string,
  wc: { contractAddress: string | null; decimals: number; currency: string }
): Promise<string> {
  const chain = chainKey(blockchain);
  if (chain === 'tron' || chain === 'trx') {
    if (!wc.contractAddress) return '0';
    try {
      return await getTronTrc20Balance(address, wc.contractAddress, wc.decimals ?? 6);
    } catch {
      return '0';
    }
  }
  try {
    const tokens = await tatumService.getSupportedTokenBalances(blockchain, address);
    const match = (tokens ?? []).find(
      (t: { contractAddress?: string }) =>
        t.contractAddress &&
        wc.contractAddress &&
        String(t.contractAddress).toLowerCase() === String(wc.contractAddress).toLowerCase()
    );
    return match?.amount != null ? String(match.amount) : '0';
  } catch {
    return '0';
  }
}

export async function getMasterWalletAssets(walletId?: string): Promise<AssetItem[]> {
  if (walletId && walletId !== 'tercescrow') {
    return [];
  }
  const wallets = await prisma.masterWallet.findMany();
  const currencies = await prisma.walletCurrency.findMany({
    orderBy: [{ blockchain: 'asc' }, { isToken: 'asc' }, { currency: 'asc' }],
  });

  const walletByChain = new Map<string, (typeof wallets)[0]>();
  for (const w of wallets) {
    if (w.address) walletByChain.set(chainKey(w.blockchain), w);
  }

  const nativeBalCache = new Map<string, string>();
  const assets: AssetItem[] = [];

  for (const wc of currencies) {
    const chain = chainKey(wc.blockchain);
    const mw = walletByChain.get(chain);
    if (!mw?.address) continue;

    const displayLabel = formatDisplayLabel(wc.currency, wc.blockchain);
    const nativeWc = currencies.find((c) => chainKey(c.blockchain) === chain && !c.isToken);
    const nativeSymbol = nativeWc?.currency ?? formatChainName(wc.blockchain);

    let balance = '0';
    try {
      if (!wc.isToken) {
        if (!nativeBalCache.has(chain)) {
          if (chain === 'tron' || chain === 'trx') {
            nativeBalCache.set(chain, await getTronTrxBalance(mw.address));
          } else {
            const bal = await tatumService.getAddressBalance(wc.blockchain, mw.address, false);
            nativeBalCache.set(chain, bal?.balance ? String(bal.balance) : '0');
          }
        }
        balance = nativeBalCache.get(chain) ?? '0';
      } else {
        balance = await fetchTokenBalanceForCurrency(wc.blockchain, mw.address, {
          contractAddress: wc.contractAddress,
          decimals: wc.decimals,
          currency: wc.currency,
        });
      }
    } catch {
      balance = '0';
    }

    const price = wc.price ? Number(wc.price) : 0;
    const balNum = parseFloat(balance) || 0;
    const usdVal = Math.round(balNum * price * 100) / 100;

    const sharedMasterWalletNote = wc.isToken
      ? `Same master wallet address as ${nativeSymbol} on ${formatChainName(wc.blockchain)} — funds are held on one ${formatChainName(wc.blockchain)} address.`
      : undefined;

    assets.push({
      symbol: wc.symbol || wc.currency,
      name: wc.name || displayLabel,
      currency: wc.currency,
      blockchain: wc.blockchain,
      walletCurrencyId: wc.id,
      isToken: wc.isToken,
      displayLabel,
      sharedMasterWalletNote,
      balance,
      usdValue: usdVal,
      address: mw.address,
      tercescrowBalance: balance,
      tercescrowUsd: usdVal,
    });
  }

  for (const a of assets) {
    a.balance = a.tercescrowBalance ?? '0';
    a.usdValue = a.tercescrowUsd ?? 0;
  }
  return assets;
}

export async function getMasterWalletTransactions(
  assetSymbol?: string,
  walletId?: string
): Promise<MasterWalletTxItem[]> {
  const where: any = {};
  if (walletId) where.walletId = walletId;
  if (assetSymbol) {
    const sym = String(assetSymbol).trim().toUpperCase();
    where.OR = [{ assetSymbol: sym }, { assetSymbol: sym.toLowerCase() }, { assetSymbol: assetSymbol.trim() }];
  }
  const rows = await mwTxModel.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r: any) => ({
    id: r.id,
    to: r.toAddress,
    status: String(r.status ?? 'pending').toLowerCase(),
    type: r.type,
    wallet: r.walletId,
    amount: r.amount.toString(),
    date: r.createdAt.toISOString(),
    assetSymbol: r.assetSymbol,
    walletId: r.walletId,
    txHash: r.txHash ?? undefined,
  }));
}

export async function createMasterWalletSend(params: {
  address: string;
  amountCrypto?: string;
  amountDollar?: string;
  network: string;
  symbol: string;
  vendorId?: number;
}): Promise<{
  success: boolean;
  txId?: number;
  txHash?: string;
  status?: string;
  error?: string;
  requestedAmount?: string;
  recipientAmount?: string;
  networkFee?: string;
}> {
  const amount = params.amountCrypto?.trim() ?? '0';
  const walletId = 'tercescrow';
  const assetSymbol = String(params.symbol ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 20);

  const record = await mwTxModel.create({
    data: {
      walletId,
      type: 'send',
      assetSymbol,
      amount,
      toAddress: params.address.trim(),
      status: 'pending',
    },
  });

  try {
    const sendResult = await executeMasterWalletOnChainSend({
      address: params.address,
      amountCrypto: amount,
      network: params.network,
      symbol: params.symbol,
    });
    await mwTxModel.update({
      where: { id: record.id },
      data: { status: 'successful', txHash: sendResult.txHash },
    });
    return {
      success: true,
      txId: record.id,
      txHash: sendResult.txHash,
      status: 'successful',
      recipientAmount: sendResult.recipientAmount,
      networkFee: sendResult.networkFee,
      requestedAmount: amount,
    };
  } catch (err: any) {
    const message = err?.message ?? 'Disburse failed';
    await mwTxModel.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });
    return { success: false, txId: record.id, status: 'failed', error: message };
  }
}

export async function createMasterWalletSwap(params: {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  receivingWallet?: string;
}): Promise<{ success: boolean; txId?: number; error?: string }> {
  const walletId = 'tercescrow';
  const record = await mwTxModel.create({
    data: {
      walletId,
      type: 'swap',
      assetSymbol: params.fromSymbol,
      amount: params.fromAmount,
      status: 'pending',
    },
  });
  return { success: true, txId: record.id };
}
