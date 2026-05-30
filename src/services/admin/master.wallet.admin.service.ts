import { prisma } from '../../utils/prisma';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import tatumService from '../tatum/tatum.service';
import { getTronTrc20Balance, getTronTrxBalance } from '../tron/tron.tatum.service';
import { UserRoles } from '@prisma/client';
import cryptoRateService from '../crypto/crypto.rate.service';
import {
  estimateMasterWalletSend,
  executeMasterWalletOnChainSend,
  type MasterWalletSendEstimate,
} from './master.wallet.outbound.service';
import { palmpayMerchantService } from '../palmpay/palmpay.merchant.service';

export { estimateMasterWalletSend, type MasterWalletSendEstimate };

const mwTxModel = (prisma as any).masterWalletTransaction;

function chainKey(blockchain: string): string {
  return String(blockchain ?? '').toLowerCase().trim();
}

function normalizeCurrencyTicker(currency: string): string {
  const raw = String(currency ?? '').trim();
  if (!raw) return '—';
  const u = raw.toUpperCase().replace(/\s+/g, '');
  const m = u.match(/^(USDT|USDC|DAI|BUSD|BTC|ETH|BNB|TRX|SOL|LTC|DOGE|MATIC)_(.+)$/);
  if (m) return m[1];
  if (u.includes('_')) {
    const base = u.split('_')[0];
    if (['USDT', 'USDC', 'DAI', 'BUSD', 'BTC', 'ETH', 'BNB', 'TRX', 'SOL', 'LTC', 'DOGE', 'MATIC'].includes(base)) {
      return base;
    }
  }
  return raw;
}

function tokenStandardForChain(blockchain: string, isToken: boolean): string | null {
  if (!isToken) return null;
  const chain = String(blockchain ?? '').toLowerCase();
  if (chain === 'tron' || chain === 'trx') return 'TRC20';
  if (chain === 'ethereum' || chain === 'eth') return 'ERC20';
  if (chain === 'bsc') return 'BEP20';
  if (chain === 'polygon' || chain === 'matic') return 'Polygon';
  if (chain === 'solana' || chain === 'sol') return 'SPL';
  return 'Token';
}

/** Client-friendly label, e.g. "USDT TRC20 (Tron)". */
function formatDisplayLabel(currency: string, blockchain: string, isToken = false): string {
  const chain = String(blockchain ?? '').trim();
  let c = normalizeCurrencyTicker(currency);
  if (!isToken) {
    const cl = chain.toLowerCase();
    if (cl === 'bsc' && (c === 'BSC' || c === 'BNB')) c = 'BNB';
    if ((cl === 'tron' || cl === 'trx') && (c === 'TRON' || c === 'TRX')) c = 'TRX';
  }
  if (!c || c === '—') return chain || '—';
  if (!chain) return c;
  const chainLabel =
    chain.length <= 4 ? chain.toUpperCase() : chain.charAt(0).toUpperCase() + chain.slice(1).toLowerCase();
  const standard = tokenStandardForChain(chain, isToken);
  if (standard) return `${c} ${standard} (${chainLabel})`;
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
  palmpayAvailableNgn?: number;
  palmpayFrozenNgn?: number;
  palmpayCurrentNgn?: number;
  palmpayUnsettledNgn?: number;
  palmpayMerchantId?: string;
  palmpayError?: string;
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
  txHash?: string;
  performedBy?: {
    userId: number;
    name: string;
    role: string;
  };
  vendor?: {
    id: number;
    name: string;
  };
  notes?: string;
}

export interface UserPendingAssetItem {
  walletCurrencyId: number;
  symbol: string;
  currency: string;
  blockchain: string;
  displayLabel: string;
  isToken: boolean;
  totalBalance: string;
  totalUsd: number;
  totalNgn: number;
  userCount: number;
}

export interface UserPendingCryptoSummary {
  totalUsd: number;
  totalNgn: number;
  usersWithBalance: number;
  assets: UserPendingAssetItem[];
}

function formatStaffRole(role: string | null | undefined): string {
  const r = String(role ?? '').toLowerCase();
  if (r === 'admin') return 'Admin';
  if (r === 'agent') return 'Agent';
  if (r === 'customer') return 'Customer';
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Staff';
}

function mapPerformer(user: { id: number; firstname: string; lastname: string; role: string } | null | undefined) {
  if (!user) return undefined;
  const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || `User #${user.id}`;
  return {
    userId: user.id,
    name,
    role: formatStaffRole(user.role),
  };
}

export async function getMasterWalletBalanceSummary(): Promise<BalanceSummaryItem[]> {
  const assets = await getMasterWalletAssets('tercescrow');
  let totalUsd = 0;
  let totalNgn = 0;
  let totalBtc = 0;

  const currencies = await prisma.walletCurrency.findMany();
  const priceById = new Map(currencies.map((c) => [c.id, c]));

  for (const a of assets) {
    totalUsd += a.usdValue ?? 0;
    const wc = a.walletCurrencyId != null ? priceById.get(a.walletCurrencyId) : undefined;
    const nairaPrice = wc?.nairaPrice ? Number(wc.nairaPrice) : 0;
    const balNum = parseFloat(String(a.tercescrowBalance ?? a.balance ?? '0').replace(/,/g, '')) || 0;
    totalNgn += balNum * nairaPrice;
    const sym = normalizeCurrencyTicker(a.currency ?? a.symbol ?? '');
    if (sym === 'BTC') totalBtc += balNum;
  }

  const roundedUsd = Math.round(totalUsd * 100) / 100;
  const roundedNgn = Math.round(totalNgn);

  let palmpayEntry: BalanceSummaryItem = {
    walletId: 'palmpay',
    label: 'Palmpay',
    totalUsd: 0,
    totalNgn: 0,
  };

  try {
    const palmpayBalance = await palmpayMerchantService.queryMerchantBalance();
    if (palmpayBalance) {
      palmpayEntry = {
        walletId: 'palmpay',
        label: 'Palmpay',
        totalUsd: 0,
        totalNgn: Math.round(palmpayBalance.availableBalanceNgn),
        palmpayAvailableNgn: Math.round(palmpayBalance.availableBalanceNgn),
        palmpayFrozenNgn: Math.round(palmpayBalance.frozenBalanceNgn),
        palmpayCurrentNgn: Math.round(palmpayBalance.currentBalanceNgn),
        palmpayUnsettledNgn: Math.round(palmpayBalance.unSettleBalanceNgn),
        palmpayMerchantId: palmpayBalance.merchantId,
      };
    }
  } catch (err: any) {
    console.error('[MasterWallet] PalmPay merchant balance failed:', err?.message ?? err);
    palmpayEntry.palmpayError = err?.message ?? 'Failed to fetch PalmPay balance';
  }

  return [
    {
      walletId: 'tercescrow',
      label: 'Tercescrow',
      totalUsd: roundedUsd,
      totalNgn: roundedNgn,
      totalBtc: totalBtc > 0 ? Math.round(totalBtc * 1e8) / 1e8 : undefined,
    },
    {
      walletId: 'yellowcard',
      label: 'Yellow Card',
      totalUsd: 0,
      totalNgn: 0,
    },
    palmpayEntry,
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

    const displayLabel = formatDisplayLabel(wc.currency, wc.blockchain, Boolean(wc.isToken));
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
      balance: formatCryptoAmount(balance),
      usdValue: usdVal,
      address: mw.address,
      tercescrowBalance: formatCryptoAmount(balance),
      tercescrowUsd: usdVal,
    });
  }

  for (const a of assets) {
    a.balance = a.tercescrowBalance ?? '0';
    a.usdValue = a.tercescrowUsd ?? 0;
  }
  assets.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  return assets;
}

function unitPrice(value: unknown): number {
  const n = value != null ? Number(value) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Total crypto held in customer virtual accounts (not sold / withdrawn yet). */
export async function getUserPendingCryptoBalances(): Promise<UserPendingCryptoSummary> {
  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;

  const virtualAccounts = await prisma.virtualAccount.findMany({
    where: {
      active: true,
      frozen: false,
      user: { role: UserRoles.customer },
    },
    select: {
      userId: true,
      availableBalance: true,
      accountBalance: true,
      currencyId: true,
      walletCurrency: {
        select: {
          id: true,
          currency: true,
          symbol: true,
          blockchain: true,
          price: true,
          nairaPrice: true,
          isToken: true,
        },
      },
    },
  });

  type Agg = {
    walletCurrencyId: number;
    currency: string;
    symbol: string;
    blockchain: string;
    isToken: boolean;
    totalBalance: number;
    totalUsd: number;
    totalNgn: number;
    userIds: Set<number>;
  };

  const byCurrency = new Map<number, Agg>();
  const usersWithBalance = new Set<number>();

  for (const va of virtualAccounts) {
    const wc = va.walletCurrency;
    if (!wc) continue;

    const bal = parseFloat(String(va.availableBalance || va.accountBalance || '0').replace(/,/g, '')) || 0;
    if (bal <= 0) continue;

    usersWithBalance.add(va.userId);

    let agg = byCurrency.get(wc.id);
    if (!agg) {
      agg = {
        walletCurrencyId: wc.id,
        currency: wc.currency,
        symbol: wc.symbol || wc.currency,
        blockchain: wc.blockchain,
        isToken: Boolean(wc.isToken),
        totalBalance: 0,
        totalUsd: 0,
        totalNgn: 0,
        userIds: new Set<number>(),
      };
      byCurrency.set(wc.id, agg);
    }

    agg.totalBalance += bal;
    agg.userIds.add(va.userId);

    const usdPrice = unitPrice(wc.price);
    const nairaPrice = unitPrice(wc.nairaPrice);
    if (usdPrice > 0) agg.totalUsd += bal * usdPrice;
    if (nairaPrice > 0) {
      agg.totalNgn += bal * nairaPrice;
    } else if (usdPrice > 0 && ngnPerUsdFallback > 0) {
      agg.totalNgn += bal * usdPrice * ngnPerUsdFallback;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round0 = (n: number) => Math.round(n);

  const assets: UserPendingAssetItem[] = [...byCurrency.values()]
    .map((a) => ({
      walletCurrencyId: a.walletCurrencyId,
      symbol: a.symbol,
      currency: a.currency,
      blockchain: a.blockchain,
      displayLabel: formatDisplayLabel(a.currency, a.blockchain, a.isToken),
      isToken: a.isToken,
      totalBalance: formatCryptoAmount(String(a.totalBalance)),
      totalUsd: round2(a.totalUsd),
      totalNgn: round0(a.totalNgn),
      userCount: a.userIds.size,
    }))
    .filter((a) => parseFloat(a.totalBalance.replace(/,/g, '')) > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const totalUsd = round2(assets.reduce((s, a) => s + a.totalUsd, 0));
  const totalNgn = round0(assets.reduce((s, a) => s + a.totalNgn, 0));

  return {
    totalUsd,
    totalNgn,
    usersWithBalance: usersWithBalance.size,
    assets,
  };
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
    include: {
      performedBy: { select: { id: true, firstname: true, lastname: true, role: true } },
      vendor: { select: { id: true, name: true } },
      changeNowSwapOrders: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, firstname: true, lastname: true, role: true } },
        },
      },
    },
  });
  return rows.map((r: any) => {
    const swapAdmin = r.changeNowSwapOrders?.[0]?.admin;
    const performedBy = mapPerformer(r.performedBy) ?? mapPerformer(swapAdmin);
    return {
      id: r.id,
      to: r.toAddress,
      status: String(r.status ?? 'pending').toLowerCase(),
      type: r.type,
      wallet: r.walletId,
      amount: formatCryptoAmount(r.amount),
      date: r.createdAt.toISOString(),
      assetSymbol: r.assetSymbol,
      walletId: r.walletId,
      txHash: r.txHash ?? undefined,
      performedBy,
      vendor: r.vendor ? { id: r.vendor.id, name: r.vendor.name } : undefined,
      notes: r.notes ?? undefined,
    };
  });
}

export async function createMasterWalletSend(params: {
  address: string;
  amountCrypto?: string;
  amountDollar?: string;
  network: string;
  symbol: string;
  vendorId?: number;
  performedByUserId?: number;
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
      performedByUserId: params.performedByUserId ?? null,
      vendorId: params.vendorId ?? null,
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
  performedByUserId?: number;
}): Promise<{ success: boolean; txId?: number; error?: string }> {
  const walletId = 'tercescrow';
  const record = await mwTxModel.create({
    data: {
      walletId,
      type: 'swap',
      assetSymbol: params.fromSymbol,
      amount: params.fromAmount,
      status: 'pending',
      performedByUserId: params.performedByUserId ?? null,
    },
  });
  return { success: true, txId: record.id };
}
