import { prisma } from '../../utils/prisma';
import { UserRoles } from '@prisma/client';

export interface UserBalanceRow {
  id: number;
  name: string;
  email: string;
  totalBalanceUsd: number;
  totalBalanceN: number;
  cryptoBalanceUsd: number;
  cryptoBalanceN: number;
  nairaBalance: number;
}

export interface UserBalancesFilters {
  sort?: string;
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

const NGN_TO_USD_DEFAULT = 0.0006; // fallback if no rate

export async function getUserBalances(
  filters: UserBalancesFilters
): Promise<UserBalancesResult> {
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

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        fiatWallets: true,
        virtualAccounts: {
          include: {
            walletCurrency: true,
          },
        },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const rows: UserBalanceRow[] = users.map((u) => {
    let nairaBalance = 0;
    for (const w of u.fiatWallets) {
      if (w.currency === 'NGN') {
        nairaBalance += Number(w.balance);
      }
    }

    let cryptoUsd = 0;
    let cryptoNgn = 0;
    for (const va of u.virtualAccounts) {
      const bal = Number(va.availableBalance || va.accountBalance || 0);
      const wc = va.walletCurrency;
      if (wc?.price) cryptoUsd += bal * Number(wc.price);
      if (wc?.nairaPrice) cryptoNgn += bal * Number(wc.nairaPrice);
    }

    const totalUsd = cryptoUsd + nairaBalance * NGN_TO_USD_DEFAULT;
    const totalN = nairaBalance + cryptoNgn;

    return {
      id: u.id,
      name: `${u.firstname} ${u.lastname}`.trim() || u.email,
      email: u.email,
      totalBalanceUsd: Math.round(totalUsd * 100) / 100,
      totalBalanceN: Math.round(totalN * 100) / 100,
      cryptoBalanceUsd: Math.round(cryptoUsd * 100) / 100,
      cryptoBalanceN: Math.round(cryptoNgn * 100) / 100,
      nairaBalance: Math.round(nairaBalance * 100) / 100,
    };
  });

  if (filters.sort === 'balanceDesc') {
    rows.sort((a, b) => b.totalBalanceN - a.totalBalanceN);
  } else if (filters.sort === 'balanceAsc') {
    rows.sort((a, b) => a.totalBalanceN - b.totalBalanceN);
  }

  return {
    rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export interface UserBalancesSummary {
  /** Sum of customer fiat NGN wallets. */
  totalNairaWallet: number;
  /** Sum of crypto held on user deposit addresses (NGN equivalent). */
  totalCryptoDepositNgn: number;
  /** Fiat NGN + crypto deposit NGN — total user-held balances in Naira. */
  totalDepositNgn: number;
  totalCryptoDepositUsd: number;
}

/** Aggregate deposit balances across all customers (for admin dashboards). */
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
  let totalCryptoDepositNgn = 0;
  let totalCryptoDepositUsd = 0;

  for (const u of users) {
    for (const w of u.fiatWallets) {
      totalNairaWallet += Number(w.balance);
    }
    for (const va of u.virtualAccounts) {
      const bal = Number(va.availableBalance || va.accountBalance || 0);
      const wc = va.walletCurrency;
      if (wc?.price) totalCryptoDepositUsd += bal * Number(wc.price);
      if (wc?.nairaPrice) totalCryptoDepositNgn += bal * Number(wc.nairaPrice);
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  totalNairaWallet = round(totalNairaWallet);
  totalCryptoDepositNgn = round(totalCryptoDepositNgn);
  totalCryptoDepositUsd = round(totalCryptoDepositUsd);

  return {
    totalNairaWallet,
    totalCryptoDepositNgn,
    totalDepositNgn: round(totalNairaWallet + totalCryptoDepositNgn),
    totalCryptoDepositUsd,
  };
}
