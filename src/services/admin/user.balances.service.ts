import { prisma } from '../../utils/prisma';
import { UserRoles } from '@prisma/client';
import cryptoRateService from '../crypto/crypto.rate.service';

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

export type BalanceSortCurrency = 'ngn' | 'usd';

export interface UserBalancesFilters {
  /** balance-desc | balance-asc | name-az | name-za | legacy balanceDesc | balanceAsc */
  sort?: string;
  /** Which total to use when sorting by balance (default ngn). */
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

function computeUserBalanceRow(
  u: {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  fiatWallets: { currency: string; balance: unknown }[];
  virtualAccounts: {
    availableBalance: unknown;
    accountBalance: unknown;
    walletCurrency: { price: unknown; nairaPrice: unknown } | null;
  }[];
  },
  /** NGN per $1 (SELL tier) when walletCurrency.nairaPrice is unset — for crypto NGN column only. */
  ngnPerUsdFallback = 0
): UserBalanceRow {
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
    if (!Number.isFinite(bal) || bal <= 0) continue;
    const wc = va.walletCurrency;
    const usdPrice = unitPrice(wc?.price);
    const nairaPrice = unitPrice(wc?.nairaPrice);
    const lineUsd = usdPrice > 0 ? bal * usdPrice : 0;
    cryptoUsd += lineUsd;
    if (nairaPrice > 0) {
      cryptoNgn += bal * nairaPrice;
    } else if (lineUsd > 0 && ngnPerUsdFallback > 0) {
      cryptoNgn += lineUsd * ngnPerUsdFallback;
    }
  }

  // Totals are not cross-converted: $ = crypto only, N = NGN fiat wallet only.
  const totalUsd = cryptoUsd;
  const totalN = nairaBalance;

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    id: u.id,
    name: `${u.firstname} ${u.lastname}`.trim() || u.email,
    email: u.email,
    totalBalanceUsd: round(totalUsd),
    totalBalanceN: round(totalN),
    cryptoBalanceUsd: round(cryptoUsd),
    cryptoBalanceN: round(cryptoNgn),
    nairaBalance: round(nairaBalance),
  };
}

function resolveBalanceSort(
  sort: string | undefined,
  balanceCurrency: string | undefined
): { mode: 'balance' | 'name'; desc: boolean; currency: BalanceSortCurrency } {
  const currency: BalanceSortCurrency =
    String(balanceCurrency ?? 'ngn').toLowerCase() === 'usd' ? 'usd' : 'ngn';

  const s = String(sort ?? 'balance-desc').toLowerCase();

  if (s === 'name-az') {
    return { mode: 'name', desc: false, currency };
  }
  if (s === 'name-za') {
    return { mode: 'name', desc: true, currency };
  }

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

  const users = await prisma.user.findMany({
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
  });

  const { mode, desc, currency } = resolveBalanceSort(filters.sort, filters.balanceCurrency);

  const sellRateRow = await cryptoRateService.getRateForAmount('SELL', 1);
  const ngnPerUsdFallback = sellRateRow ? Number(sellRateRow.rate) : 0;

  let rows: UserBalanceRow[] = users.map((u) =>
    computeUserBalanceRow(u, Number.isFinite(ngnPerUsdFallback) ? ngnPerUsdFallback : 0)
  );

  if (mode === 'balance') {
    const key = currency;
    rows.sort((a, b) => {
      const diff = balanceSortValue(a, key) - balanceSortValue(b, key);
      return desc ? -diff : diff;
    });
  } else {
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return desc ? -cmp : cmp;
    });
  }

  const total = rows.length;
  const paginated = rows.slice(skip, skip + limit);

  return {
    rows: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
  };
}

export interface UserBalancesSummary {
  totalNairaWallet: number;
  totalCryptoDepositNgn: number;
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
      if (!Number.isFinite(bal) || bal <= 0) continue;
      const wc = va.walletCurrency;
      const usdPrice = unitPrice(wc?.price);
      const nairaPrice = unitPrice(wc?.nairaPrice);
      if (usdPrice > 0) totalCryptoDepositUsd += bal * usdPrice;
      if (nairaPrice > 0) totalCryptoDepositNgn += bal * nairaPrice;
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
