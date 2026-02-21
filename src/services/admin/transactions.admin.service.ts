import { prisma } from '../../utils/prisma';

export type AdminTransactionType = 'giftCards' | 'crypto' | 'billPayments' | 'naira';

export interface AdminTransactionsFilters {
  transactionType?: AdminTransactionType;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminTransactionRow {
  id: string;
  transactionType: AdminTransactionType;
  status: string;
  createdAt: Date;
  department?: { title?: string; niche?: string };
  category?: { title?: string };
  customer?: { id: number; name: string; email: string };
  amount?: string;
  amountNaira?: string;
  amountUsd?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminTransactionsResult {
  transactions: AdminTransactionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function toDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function getAdminTransactions(
  filters: AdminTransactionsFilters
): Promise<AdminTransactionsResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const startDate = toDate(filters.startDate);
  const endDate = toDate(filters.endDate);
  const search = filters.search?.trim();
  const transactionType = filters.transactionType;
  const status = filters.status;

  const dateFilter =
    startDate || endDate
      ? {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        }
      : undefined;

  if (transactionType === 'giftCards') {
    const where: any = {};
    if (dateFilter) where.createdAt = dateFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { user: { email: { contains: search } } },
        { user: { firstname: { contains: search } } },
        { user: { lastname: { contains: search } } },
        { id: { contains: search } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.giftCardOrder.findMany({
        where,
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true } },
          product: { select: { productName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.giftCardOrder.count({ where }),
    ]);
    const transactions: AdminTransactionRow[] = rows.map((o) => ({
      id: o.id,
      transactionType: 'giftCards',
      status: o.status,
      createdAt: o.createdAt,
      department: { title: 'Gift Cards', niche: 'giftCard' },
      category: { title: o.product?.productName ?? 'Gift Card' },
      customer: o.user
        ? {
            id: o.user.id,
            name: `${o.user.firstname} ${o.user.lastname}`.trim(),
            email: o.user.email,
          }
        : undefined,
      amount: o.totalAmount?.toString(),
      amountNaira: o.exchangeRate ? (Number(o.totalAmount) * Number(o.exchangeRate)).toFixed(2) : undefined,
      amountUsd: o.totalAmount?.toString(),
      currency: o.currencyCode,
      metadata: { productName: o.product?.productName, faceValue: o.faceValue?.toString() },
    }));
    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  if (transactionType === 'crypto') {
    const where: any = {};
    if (dateFilter) where.createdAt = dateFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { user: { email: { contains: search } } },
        { user: { firstname: { contains: search } } },
        { user: { lastname: { contains: search } } },
        { transactionId: { contains: search } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true } },
          cryptoBuy: true,
          cryptoSell: true,
          cryptoSend: true,
          cryptoReceive: true,
          cryptoSwap: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.cryptoTransaction.count({ where }),
    ]);
    const transactions: AdminTransactionRow[] = rows.map((tx) => {
      let amount = '0';
      let amountNaira: string | undefined;
      let amountUsd: string | undefined;
      const u = tx.user;
      if (tx.cryptoBuy) {
        amount = tx.cryptoBuy.amount.toString();
        amountUsd = tx.cryptoBuy.amountUsd.toString();
        amountNaira = tx.cryptoBuy.amountNaira.toString();
      } else if (tx.cryptoSell) {
        amount = tx.cryptoSell.amount.toString();
        amountUsd = tx.cryptoSell.amountUsd.toString();
        amountNaira = tx.cryptoSell.amountNaira.toString();
      } else if (tx.cryptoSend) {
        amount = tx.cryptoSend.amount.toString();
        amountUsd = tx.cryptoSend.amountUsd.toString();
        amountNaira = tx.cryptoSend.amountNaira?.toString();
      } else if (tx.cryptoReceive) {
        amount = tx.cryptoReceive.amount.toString();
        amountUsd = tx.cryptoReceive.amountUsd.toString();
        amountNaira = tx.cryptoReceive.amountNaira?.toString();
      } else if (tx.cryptoSwap) {
        amount = tx.cryptoSwap.fromAmount.toString();
        amountUsd = tx.cryptoSwap.fromAmountUsd.toString();
      }
      return {
        id: tx.transactionId,
        transactionType: 'crypto',
        status: tx.status,
        createdAt: tx.createdAt,
        department: { title: 'Crypto', niche: 'crypto' },
        category: { title: tx.transactionType },
        customer: u
          ? { id: u.id, name: `${u.firstname} ${u.lastname}`.trim(), email: u.email }
          : undefined,
        amount,
        amountNaira,
        amountUsd,
        currency: tx.currency,
        metadata: { blockchain: tx.blockchain, type: tx.transactionType },
      };
    });
    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  if (transactionType === 'billPayments') {
    const where: any = {};
    if (dateFilter) where.createdAt = dateFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { user: { email: { contains: search } } },
        { user: { firstname: { contains: search } } },
        { user: { lastname: { contains: search } } },
        { palmpayOrderNo: { contains: search } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.billPayment.count({ where }),
    ]);
    const transactions: AdminTransactionRow[] = rows.map((b) => ({
      id: b.id,
      transactionType: 'billPayments',
      status: b.status,
      createdAt: b.createdAt,
      department: { title: 'Bill Payments', niche: 'crypto' },
      category: { title: (b.billType || b.billerName) ?? 'Bill' },
      customer: b.user
        ? {
            id: b.user.id,
            name: `${b.user.firstname} ${b.user.lastname}`.trim(),
            email: b.user.email,
          }
        : undefined,
      amount: b.amount?.toString(),
      amountNaira: b.amount?.toString(),
      currency: b.currency,
      metadata: { billType: b.billType, billerName: b.billerName, itemName: b.itemName },
    }));
    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  if (transactionType === 'naira') {
    const where: any = {
      type: { in: ['deposit', 'withdrawal', 'transfer', 'credit', 'debit'] },
      billType: null,
    };
    if (dateFilter) where.createdAt = dateFilter;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { user: { email: { contains: search } } },
        { user: { firstname: { contains: search } } },
        { user: { lastname: { contains: search } } },
        { palmpayOrderNo: { contains: search } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.fiatTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fiatTransaction.count({ where }),
    ]);
    const transactions: AdminTransactionRow[] = rows.map((f) => ({
      id: f.id,
      transactionType: 'naira',
      status: f.status,
      createdAt: f.createdAt,
      department: { title: 'Naira', niche: 'crypto' },
      category: { title: f.type },
      customer: f.user
        ? {
            id: f.user.id,
            name: `${f.user.firstname} ${f.user.lastname}`.trim(),
            email: f.user.email,
          }
        : undefined,
      amount: f.amount?.toString(),
      amountNaira: f.totalAmount?.toString(),
      currency: f.currency,
      metadata: { type: f.type, description: f.description },
    }));
    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // No type or "all": return empty with message or combine; plan says "each row has transactionType"
  // Return empty result when no filter so frontend can request by type
  return {
    transactions: [],
    total: 0,
    page: 1,
    limit,
    totalPages: 0,
  };
}
