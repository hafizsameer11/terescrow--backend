import { prisma } from '../../utils/prisma';
import { UserRoles } from '@prisma/client';
import cryptoRateService from '../crypto/crypto.rate.service';
import { getOnChainBalance, getTotalBalance, getVirtualBalance } from '../crypto/virtual.account.balance.helper';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import { fetchOnChainTokenBalance } from '../crypto/onchain.balance.service';
import { getSoldTotalsMapForReceives } from './receive.sold.amount.service';

export interface UserBalanceRow {
  id: number;
  name: string;
  email: string;
  virtualBalanceUsd: number;
  onChainBalanceUsd: number;
  totalBalanceUsd: number;
  nairaBalance: number;
  /** @deprecated use totalBalanceUsd */
  cryptoBalanceUsd: number;
  /** @deprecated use totalBalanceN equivalent */
  cryptoBalanceN: number;
  totalBalanceN: number;
}

export interface UserAssetBalanceRow {
  currency: string;
  blockchain: string;
  symbol: string | null;
  virtualBalance: string;
  onChainBalance: string;
  totalBalance: string;
  virtualBalanceUsd: number;
  onChainBalanceUsd: number;
  totalBalanceUsd: number;
  depositAddress: string | null;
}

export interface UserBalancesSummary {
  totalVirtualUsd: number;
  totalOnChainUsd: number;
  totalCryptoUsd: number;
  totalNairaWallet: number;
  /** @deprecated */
  totalCryptoDepositNgn: number;
  totalCryptoDepositUsd: number;
  totalDepositNgn: number;
}

export type BalanceSortCurrency = 'ngn' | 'usd';

export interface UserBalancesFilters {
  sort?: string;
  balanceCurrency?: BalanceSortCurrency | string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UserBalancesResult {
  rows: UserBalanceRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function unitPrice(value: unknown): number {
  const n = value != null ? Number(value) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function lineUsd(bal: number, usdPrice: number, nairaPrice: number, ngnPerUsdFallback: number) {
  const lineUsdVal = usdPrice > 0 ? bal * usdPrice : 0;
  let lineNgn = 0;
  if (nairaPrice > 0) lineNgn = bal * nairaPrice;
  else if (lineUsdVal > 0 && ngnPerUsdFallback > 0) lineNgn = lineUsdVal * ngnPerUsdFallback;
  return { lineUsd: lineUsdVal, lineNgn };
}

function computeUserBalanceRow(
  u: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    fiatWallets: { currency: string; balance: unknown }[];
    virtualAccounts: {
      virtualBalance?: unknown;
      onChainBalance?: unknown;
      availableBalance: unknown;
      accountBalance: unknown;
      walletCurrency: { price: unknown; nairaPrice: unknown } | null;
    }[];
  },
  ngnPerUsdFallback = 0
): UserBalanceRow {
  let nairaBalance = 0;
  for (const w of u.fiatWallets) {
    if (w.currency === 'NGN') nairaBalance += Number(w.balance);
  }

  let virtualUsd = 0;
  let onChainUsd = 0;
  let cryptoNgn = 0;

  for (const va of u.virtualAccounts) {
    const virtualBal = Number(getVirtualBalance(va).toString());
    const onChainBal = Number(getOnChainBalance(va).toString());
    const totalBal = Number(getTotalBalance(va).toString());
    if (!Number.isFinite(totalBal) || totalBal <= 0) continue;
    const wc = va.walletCurrency;
    const usdPrice = unitPrice(wc?.price);
    const nairaPrice = unitPrice(wc?.nairaPrice);
    virtualUsd += lineUsd(virtualBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd;
    onChainUsd += lineUsd(onChainBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd;
    cryptoNgn += lineUsd(totalBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineNgn;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const totalUsd = virtualUsd + onChainUsd;

  return {
    id: u.id,
    name: `${u.firstname} ${u.lastname}`.trim() || u.email,
    email: u.email,
    virtualBalanceUsd: round(virtualUsd),
    onChainBalanceUsd: round(onChainUsd),
    totalBalanceUsd: round(totalUsd),
    nairaBalance: round(nairaBalance),
    totalBalanceN: round(nairaBalance),
    cryptoBalanceUsd: round(totalUsd),
    cryptoBalanceN: round(cryptoNgn),
  };
}

function resolveBalanceSort(
  sort: string | undefined,
  balanceCurrency: string | undefined
): { mode: 'balance' | 'name'; desc: boolean; currency: BalanceSortCurrency } {
  const currency: BalanceSortCurrency =
    String(balanceCurrency ?? 'ngn').toLowerCase() === 'usd' ? 'usd' : 'ngn';
  const s = String(sort ?? 'balance-desc').toLowerCase();
  if (s === 'name-az') return { mode: 'name', desc: false, currency };
  if (s === 'name-za') return { mode: 'name', desc: true, currency };
  const asc =
    s === 'balance-asc' ||
    s === 'balanceasc' ||
    s === 'total-balance-asc' ||
    s === 'crypto-balance-asc' ||
    s === 'local-balance-asc';
  return { mode: 'balance', desc: !asc, currency };
}

function balanceSortValue(row: UserBalanceRow, currency: BalanceSortCurrency): number {
  if (currency === 'usd') return row.totalBalanceUsd;
  return row.totalBalanceN;
}

export async function getUserBalances(filters: UserBalancesFilters): Promise<UserBalancesResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const search = filters.search?.trim();

  const where: any = { role: UserRoles.customer };
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { firstname: { contains: search } },
      { lastname: { contains: search } },
      { username: { contains: search } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      firstname: true,
      lastname: true,
      email: true,
      fiatWallets: true,
      virtualAccounts: {
        include: { walletCurrency: true },
      },
    },
  });

  const { mode, desc, currency } = resolveBalanceSort(filters.sort, filters.balanceCurrency);
  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;

  let rows: UserBalanceRow[] = users.map((u) =>
    computeUserBalanceRow(u, Number.isFinite(ngnPerUsdFallback) ? ngnPerUsdFallback : 0)
  );

  if (mode === 'balance') {
    rows.sort((a, b) => {
      const diff = balanceSortValue(a, currency) - balanceSortValue(b, currency);
      return desc ? -diff : diff;
    });
  } else {
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return desc ? -cmp : cmp;
    });
  }

  const total = rows.length;
  return {
    rows: rows.slice(skip, skip + limit),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
  };
}

export async function getUserBalancesSummary(): Promise<UserBalancesSummary> {
  const users = await prisma.user.findMany({
    where: { role: UserRoles.customer },
    select: {
      fiatWallets: { where: { currency: 'NGN' }, select: { balance: true } },
      virtualAccounts: {
        include: { walletCurrency: { select: { price: true, nairaPrice: true } } },
      },
    },
  });

  let totalNairaWallet = 0;
  let totalVirtualUsd = 0;
  let totalOnChainUsd = 0;
  let totalCryptoDepositNgn = 0;

  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;

  for (const u of users) {
    for (const w of u.fiatWallets) totalNairaWallet += Number(w.balance);
    for (const va of u.virtualAccounts) {
      const virtualBal = Number(getVirtualBalance(va).toString());
      const onChainBal = Number(getOnChainBalance(va).toString());
      const totalBal = Number(getTotalBalance(va).toString());
      if (totalBal <= 0 && virtualBal <= 0 && onChainBal <= 0) continue;
      const wc = va.walletCurrency;
      const usdPrice = unitPrice(wc?.price);
      const nairaPrice = unitPrice(wc?.nairaPrice);
      totalVirtualUsd += lineUsd(virtualBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd;
      totalOnChainUsd += lineUsd(onChainBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd;
      totalCryptoDepositNgn += lineUsd(totalBal, usdPrice, nairaPrice, ngnPerUsdFallback).lineNgn;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const totalCryptoUsd = totalVirtualUsd + totalOnChainUsd;

  return {
    totalVirtualUsd: round(totalVirtualUsd),
    totalOnChainUsd: round(totalOnChainUsd),
    totalCryptoUsd: round(totalCryptoUsd),
    totalNairaWallet: round(totalNairaWallet),
    totalCryptoDepositNgn: round(totalCryptoDepositNgn),
    totalCryptoDepositUsd: round(totalCryptoUsd),
    totalDepositNgn: round(totalNairaWallet + totalCryptoDepositNgn),
  };
}

export async function getUserAssetBalances(userId: number): Promise<UserAssetBalanceRow[]> {
  const accounts = await prisma.virtualAccount.findMany({
    where: { userId },
    include: {
      walletCurrency: true,
      depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { currency: 'asc' },
  });

  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;

  return accounts
    .map((va): UserAssetBalanceRow | null => {
      const virtualBal = getVirtualBalance(va);
      const onChainBal = getOnChainBalance(va);
      const totalBal = getTotalBalance(va);
      if (totalBal.lte(0) && virtualBal.lte(0) && onChainBal.lte(0)) return null;
      const usdPrice = unitPrice(va.walletCurrency?.price);
      const nairaPrice = unitPrice(va.walletCurrency?.nairaPrice);
      const v = Number(virtualBal.toString());
      const o = Number(onChainBal.toString());
      const t = Number(totalBal.toString());
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        currency: va.currency,
        blockchain: va.blockchain,
        symbol: va.walletCurrency?.symbol ?? null,
        virtualBalance: virtualBal.toString(),
        onChainBalance: onChainBal.toString(),
        totalBalance: totalBal.toString(),
        virtualBalanceUsd: round(lineUsd(v, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd),
        onChainBalanceUsd: round(lineUsd(o, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd),
        totalBalanceUsd: round(lineUsd(t, usdPrice, nairaPrice, ngnPerUsdFallback).lineUsd),
        depositAddress: va.depositAddresses[0]?.address ?? null,
      };
    })
    .filter((r): r is UserAssetBalanceRow => r != null);
}

export interface UserDepositActivityRow {
  transactionId: string;
  txHash: string;
  currency: string;
  blockchain: string;
  amount: string;
  amountUsd: string;
  status: string;
  depositStatus: string;
  soldAmountUsd: string;
  userRetentionUsd: string;
  onChainDepositBalance: string | null;
  date: string;
}

export interface UserVirtualActivityRow {
  transactionId: string;
  activityType: 'purchase' | 'sell' | 'send';
  balanceBucket: string | null;
  sellBatchId: string | null;
  currency: string;
  blockchain: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  status: string;
  date: string;
}

export interface UserWalletDetail {
  user: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    username: string | null;
    profilePicture: string | null;
  };
  balances: UserBalanceRow;
  assets: UserAssetBalanceRow[];
  deposits: UserDepositActivityRow[];
  virtualActivity: UserVirtualActivityRow[];
}

function depositStatusLabel(status: string): string {
  const s = (status || 'unknown').toLowerCase().replace(/\s/g, '');
  if (s === 'inwallet') return 'In wallet';
  if (s === 'transferredtomaster') return 'Transferred to master';
  if (s === 'senttovendor') return 'Sent to vendor';
  return 'Unknown';
}

export async function getUserWalletDetail(userId: number): Promise<UserWalletDetail | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: UserRoles.customer },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      email: true,
      username: true,
      profilePicture: true,
      fiatWallets: true,
      virtualAccounts: { include: { walletCurrency: true } },
    },
  });
  if (!user) return null;

  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;
  const balances = computeUserBalanceRow(user, Number.isFinite(ngnPerUsdFallback) ? ngnPerUsdFallback : 0);
  const assets = await getUserAssetBalances(userId);

  const receiveTxs = await prisma.cryptoTransaction.findMany({
    where: { userId, transactionType: 'RECEIVE', cryptoReceive: { isNot: null } },
    include: {
      cryptoReceive: true,
      virtualAccount: {
        include: {
          depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
          walletCurrency: {
            select: {
              symbol: true,
              contractAddress: true,
              decimals: true,
              currency: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  const txHashes = receiveTxs.map((t) => t.cryptoReceive!.txHash).filter(Boolean);
  const receivedAssets = txHashes.length
    ? await prisma.receivedAsset.findMany({
        where: { txId: { in: txHashes } },
        select: { txId: true, status: true },
      })
    : [];
  const assetStatusMap = new Map(receivedAssets.map((a) => [a.txId, a.status]));
  const soldMap = await getSoldTotalsMapForReceives(
    receiveTxs.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      virtualAccountId: tx.virtualAccountId,
      createdAt: tx.createdAt,
      amountUsd: tx.cryptoReceive!.amountUsd,
    }))
  );

  const deposits: UserDepositActivityRow[] = await Promise.all(
    receiveTxs.map(async (tx) => {
      const recv = tx.cryptoReceive!;
      const masterStatus = assetStatusMap.get(recv.txHash) ?? 'unknown';
      const sold = soldMap.get(tx.id) ?? {
        soldAmount: '0',
        soldAmountUsd: '0',
        soldAmountNaira: '0',
        userRetentionUsd: recv.amountUsd.toString(),
      };
      const depositAddress = tx.virtualAccount?.depositAddresses?.[0]?.address ?? recv.toAddress;
      let onChainDepositBalance: string | null = null;
      try {
        const bal = await fetchOnChainTokenBalance({
          blockchain: tx.blockchain,
          address: depositAddress,
          contractAddress: tx.virtualAccount?.walletCurrency?.contractAddress ?? 'USDT_TRON',
          decimals: tx.virtualAccount?.walletCurrency?.decimals ?? 6,
          isToken: true,
        });
        onChainDepositBalance = formatCryptoAmount(bal);
      } catch {
        onChainDepositBalance = null;
      }
      return {
        transactionId: tx.transactionId,
        txHash: recv.txHash,
        currency: tx.currency,
        blockchain: tx.blockchain,
        amount: formatCryptoAmount(recv.creditedAmount ?? recv.amount),
        amountUsd: (recv.creditedAmountUsd ?? recv.amountUsd).toString(),
        status: tx.status,
        depositStatus: depositStatusLabel(masterStatus),
        soldAmountUsd: sold.soldAmountUsd,
        userRetentionUsd: sold.userRetentionUsd,
        onChainDepositBalance,
        date: tx.createdAt.toISOString(),
      };
    })
  );

  const virtualTxs = await prisma.cryptoTransaction.findMany({
    where: {
      userId,
      OR: [
        { transactionType: 'BUY' },
        { transactionType: 'SELL', balanceBucket: 'virtual' },
        { transactionType: 'SEND', balanceBucket: 'virtual' },
      ],
    },
    include: { cryptoBuy: true, cryptoSell: true, cryptoSend: true },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  const virtualActivity: UserVirtualActivityRow[] = virtualTxs.map((tx) => {
    const buy = tx.cryptoBuy;
    const sell = tx.cryptoSell;
    const send = tx.cryptoSend;
    const leg = buy ?? sell ?? send;
    const activityType: UserVirtualActivityRow['activityType'] = buy
      ? 'purchase'
      : sell
        ? 'sell'
        : 'send';
    return {
      transactionId: tx.transactionId,
      activityType,
      balanceBucket: tx.balanceBucket,
      sellBatchId: tx.sellBatchId,
      currency: tx.currency,
      blockchain: tx.blockchain,
      amount: leg ? formatCryptoAmount(leg.amount) : '0',
      amountUsd: leg?.amountUsd.toString() ?? '0',
      amountNaira:
        buy?.amountNaira?.toString() ??
        sell?.amountNaira?.toString() ??
        send?.amountNaira?.toString() ??
        '0',
      status: tx.status,
      date: tx.createdAt.toISOString(),
    };
  });

  return {
    user: {
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      username: user.username,
      profilePicture: user.profilePicture,
    },
    balances,
    assets,
    deposits,
    virtualActivity,
  };
}
