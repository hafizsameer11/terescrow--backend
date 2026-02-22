import { prisma } from '../../utils/prisma';
import { CryptoTxType } from '@prisma/client';

export type NicheType = 'crypto' | 'giftcard' | 'billpayment' | 'naira';

export interface TransactionFilters {
  niche?: NicheType;
  type?: 'buy' | 'sell';
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  customerId?: number;
}

export interface UnifiedTransaction {
  id: number | string;
  transactionId: string;
  status: string;
  amount: number;
  amountNaira: number;
  createdAt: string;
  updatedAt: string;
  profit: number;
  department: { id: number; title: string; niche: string; Type: string };
  category: { id: number; title: string; subTitle: string | null; image: string | null };
  subCategory: { id: number; title: string } | null;
  customer: {
    id: number; username: string; firstname: string; lastname: string;
    profilePicture: string | null; country: string;
  } | null;
  agent: {
    id: number; username: string; firstname: string; lastname: string;
    profilePicture: string | null;
  } | null;
  fromAddress: string | null;
  toAddress: string | null;
  cardType: string | null;
  cardNumber: string | null;
  giftCardSubType: string | null;
  billType: string | null;
  billReference: string | null;
  billProvider: string | null;
  nairaType: string | null;
  nairaChannel: string | null;
  nairaReference: string | null;
}

export interface TransactionsResult {
  transactions: UnifiedTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const USER_SELECT = {
  id: true, username: true, firstname: true, lastname: true,
  profilePicture: true, country: true,
} as const;

const NULL_TYPE_FIELDS = {
  fromAddress: null as string | null,
  toAddress: null as string | null,
  cardType: null as string | null,
  cardNumber: null as string | null,
  giftCardSubType: null as string | null,
  billType: null as string | null,
  billReference: null as string | null,
  billProvider: null as string | null,
  nairaType: null as string | null,
  nairaChannel: null as string | null,
  nairaReference: null as string | null,
};

function toDate(s?: string, endOfDay = false): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeStatus(dbStatus: string): string {
  if (dbStatus === 'completed') return 'successful';
  if (dbStatus === 'cancelled' || dbStatus === 'refunded') return 'declined';
  return dbStatus;
}

function statusToDbValues(s: string): string[] {
  if (s === 'successful') return ['successful', 'completed'];
  if (s === 'declined') return ['declined', 'failed', 'cancelled', 'refunded'];
  if (s === 'pending') return ['pending', 'processing'];
  return [s];
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const start = toDate(startDate);
  const end = toDate(endDate, true);
  if (!start && !end) return undefined;
  return { ...(start && { gte: start }), ...(end && { lte: end }) };
}

function mapUser(u: any) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, firstname: u.firstname,
    lastname: u.lastname, profilePicture: u.profilePicture ?? null,
    country: u.country ?? '',
  };
}

function cryptoDeptType(t: CryptoTxType): string {
  if (t === 'BUY' || t === 'RECEIVE') return 'buy';
  if (t === 'SELL' || t === 'SEND') return 'sell';
  return 'buy';
}

function cryptoDeptTitle(t: CryptoTxType): string {
  const m: Record<string, string> = {
    BUY: 'Buy Crypto', SELL: 'Sell Crypto', SEND: 'Send Crypto',
    RECEIVE: 'Receive Crypto', SWAP: 'Swap Crypto',
  };
  return m[t] || 'Crypto';
}

// ── Gift Card queries & mapper ──

async function queryGiftCards(f: TransactionFilters, take: number, skip: number) {
  if (f.type === 'sell') return { rows: [] as any[], count: 0 };
  const where: any = {};
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) where.status = { in: statusToDbValues(f.status) };
  if (f.customerId) where.userId = f.customerId;
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { id: { contains: q } },
      { product: { productName: { contains: q } } },
    ];
  }
  const [rows, count] = await Promise.all([
    prisma.giftCardOrder.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: {
        user: { select: USER_SELECT },
        product: { select: { productName: true, reloadlyImageUrl: true } },
      },
    }),
    prisma.giftCardOrder.count({ where }),
  ]);
  return { rows, count };
}

function mapGiftCard(o: any): UnifiedTransaction {
  const amt = Number(o.totalAmount || 0);
  const rate = Number(o.exchangeRate || 0);
  return {
    id: o.id,
    transactionId: o.id,
    status: normalizeStatus(o.status),
    amount: amt,
    amountNaira: rate ? Math.round(amt * rate * 100) / 100 : 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    profit: 0,
    department: { id: 0, title: 'Gift Cards', niche: 'giftcard', Type: 'buy' },
    category: {
      id: o.productId ?? 0,
      title: o.product?.productName ?? 'Gift Card',
      subTitle: o.currencyCode ?? null,
      image: o.product?.reloadlyImageUrl ?? null,
    },
    subCategory: null,
    customer: mapUser(o.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    cardType: o.cardType ?? null,
    cardNumber: o.cardNumber ?? null,
  };
}

// ── Crypto queries & mapper ──

async function queryCrypto(f: TransactionFilters, take: number, skip: number) {
  const where: any = {};
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) where.status = { in: statusToDbValues(f.status) };
  if (f.customerId) where.userId = f.customerId;
  if (f.type === 'buy') where.transactionType = { in: ['BUY', 'RECEIVE'] };
  else if (f.type === 'sell') where.transactionType = { in: ['SELL', 'SEND'] };
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { transactionId: { contains: q } },
      { currency: { contains: q } },
    ];
  }
  const [rows, count] = await Promise.all([
    prisma.cryptoTransaction.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: {
        user: { select: USER_SELECT },
        cryptoBuy: true, cryptoSell: true,
        cryptoSend: true, cryptoReceive: true, cryptoSwap: true,
      },
    }),
    prisma.cryptoTransaction.count({ where }),
  ]);
  return { rows, count };
}

function mapCrypto(tx: any): UnifiedTransaction {
  let amount = 0, amountNaira = 0;
  let fromAddr: string | null = null, toAddr: string | null = null;
  const child = tx.cryptoBuy || tx.cryptoSell || tx.cryptoSend || tx.cryptoReceive || tx.cryptoSwap;
  if (tx.cryptoBuy) {
    amount = Number(tx.cryptoBuy.amountUsd || 0);
    amountNaira = Number(tx.cryptoBuy.amountNaira || 0);
    fromAddr = tx.cryptoBuy.fromAddress ?? null;
    toAddr = tx.cryptoBuy.toAddress ?? null;
  } else if (tx.cryptoSell) {
    amount = Number(tx.cryptoSell.amountUsd || 0);
    amountNaira = Number(tx.cryptoSell.amountNaira || 0);
    fromAddr = tx.cryptoSell.fromAddress ?? null;
    toAddr = tx.cryptoSell.toAddress ?? null;
  } else if (tx.cryptoSend) {
    amount = Number(tx.cryptoSend.amountUsd || 0);
    amountNaira = Number(tx.cryptoSend.amountNaira || 0);
    fromAddr = tx.cryptoSend.fromAddress;
    toAddr = tx.cryptoSend.toAddress;
  } else if (tx.cryptoReceive) {
    amount = Number(tx.cryptoReceive.amountUsd || 0);
    amountNaira = Number(tx.cryptoReceive.amountNaira || 0);
    fromAddr = tx.cryptoReceive.fromAddress;
    toAddr = tx.cryptoReceive.toAddress;
  } else if (tx.cryptoSwap) {
    amount = Number(tx.cryptoSwap.fromAmountUsd || 0);
    fromAddr = tx.cryptoSwap.fromAddress ?? null;
    toAddr = tx.cryptoSwap.toAddress ?? null;
  }
  return {
    id: tx.id,
    transactionId: tx.transactionId,
    status: normalizeStatus(tx.status),
    amount: Math.round(amount * 100) / 100,
    amountNaira: Math.round(amountNaira * 100) / 100,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    profit: 0,
    department: {
      id: 0, title: cryptoDeptTitle(tx.transactionType),
      niche: 'crypto', Type: cryptoDeptType(tx.transactionType),
    },
    category: { id: 0, title: tx.currency, subTitle: tx.currency, image: null },
    subCategory: null,
    customer: mapUser(tx.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    fromAddress: fromAddr,
    toAddress: toAddr,
  };
}

// ── Bill Payment queries & mapper ──

async function queryBillPayments(f: TransactionFilters, take: number, skip: number) {
  if (f.type === 'sell') return { rows: [] as any[], count: 0 };
  const where: any = {};
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) where.status = { in: statusToDbValues(f.status) };
  if (f.customerId) where.userId = f.customerId;
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { transactionId: { contains: q } },
      { billType: { contains: q } },
      { billerName: { contains: q } },
    ];
  }
  const [rows, count] = await Promise.all([
    prisma.billPayment.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT } },
    }),
    prisma.billPayment.count({ where }),
  ]);
  return { rows, count };
}

function mapBillPayment(b: any): UnifiedTransaction {
  const amt = Number(b.amount || 0);
  return {
    id: b.id,
    transactionId: b.transactionId,
    status: normalizeStatus(b.status),
    amount: amt,
    amountNaira: amt,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    profit: 0,
    department: { id: 0, title: 'Bill Payments', niche: 'billpayment', Type: 'buy' },
    category: { id: 0, title: b.billType ?? 'Bill Payment', subTitle: b.billerName ?? null, image: null },
    subCategory: null,
    customer: mapUser(b.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    billType: b.billType ?? null,
    billReference: b.billReference ?? null,
    billProvider: b.provider ?? b.billerName ?? null,
  };
}

// ── Naira (FiatTransaction) queries & mapper ──

async function queryNaira(f: TransactionFilters, take: number, skip: number) {
  const where: any = { billType: null };
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) where.status = { in: statusToDbValues(f.status) };
  if (f.customerId) where.userId = f.customerId;
  if (f.type === 'buy') where.type = { in: ['deposit', 'credit'] };
  else if (f.type === 'sell') where.type = { in: ['withdrawal', 'debit'] };
  else where.type = { in: ['deposit', 'withdrawal', 'transfer', 'credit', 'debit'] };
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { id: { contains: q } },
      { palmpayOrderNo: { contains: q } },
    ];
  }
  const [rows, count] = await Promise.all([
    prisma.fiatTransaction.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT } },
    }),
    prisma.fiatTransaction.count({ where }),
  ]);
  return { rows, count };
}

function mapNaira(f: any): UnifiedTransaction {
  const totalAmt = Number(f.totalAmount || f.amount || 0);
  const deptType = ['deposit', 'credit'].includes(f.type) ? 'buy' : 'sell';
  return {
    id: f.id,
    transactionId: f.id,
    status: normalizeStatus(f.status),
    amount: 0,
    amountNaira: totalAmt,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    profit: 0,
    department: { id: 0, title: 'Naira', niche: 'naira', Type: deptType },
    category: { id: 0, title: f.type ?? 'Naira', subTitle: null, image: null },
    subCategory: null,
    customer: mapUser(f.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    nairaType: f.type ?? null,
    nairaChannel: f.description ?? null,
    nairaReference: f.palmpayOrderNo ?? null,
  };
}

// ── Main entry: list transactions ──

export async function getAdminTransactions(filters: TransactionFilters): Promise<TransactionsResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  if (filters.niche) {
    const queryMap: Record<NicheType, { query: typeof queryGiftCards; map: typeof mapGiftCard }> = {
      giftcard: { query: queryGiftCards, map: mapGiftCard },
      crypto: { query: queryCrypto, map: mapCrypto },
      billpayment: { query: queryBillPayments, map: mapBillPayment },
      naira: { query: queryNaira, map: mapNaira },
    };
    const entry = queryMap[filters.niche];
    if (!entry) return { transactions: [], total: 0, page, limit, totalPages: 0 };
    const { rows, count } = await entry.query(filters, limit, skip);
    return {
      transactions: rows.map(entry.map),
      total: count,
      page, limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  // All niches combined — fetch enough from each source to fill the requested page
  const fetchLimit = page * limit;
  const [gc, crypto, bill, naira] = await Promise.all([
    queryGiftCards(filters, fetchLimit, 0),
    queryCrypto(filters, fetchLimit, 0),
    queryBillPayments(filters, fetchLimit, 0),
    queryNaira(filters, fetchLimit, 0),
  ]);

  const all: UnifiedTransaction[] = [
    ...gc.rows.map(mapGiftCard),
    ...crypto.rows.map(mapCrypto),
    ...bill.rows.map(mapBillPayment),
    ...naira.rows.map(mapNaira),
  ];
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = gc.count + crypto.count + bill.count + naira.count;
  return {
    transactions: all.slice(skip, skip + limit),
    total, page, limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ── Transaction stats ──

export async function getAdminTransactionStats(filters: {
  niche?: NicheType;
  startDate?: string;
  endDate?: string;
}) {
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate);
  const curWhere = dateFilter ? { createdAt: dateFilter } : {};

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let prevWhere: any;
  if (filters.startDate && filters.endDate) {
    const s = new Date(filters.startDate);
    const e = new Date(filters.endDate);
    const dur = e.getTime() - s.getTime();
    prevWhere = { createdAt: { gte: new Date(s.getTime() - dur), lte: new Date(s.getTime() - 1) } };
  } else {
    prevWhere = { createdAt: { gte: prevMonthStart, lt: monthStart } };
  }

  const calc = (cur: number, prev: number) => {
    if (prev === 0) return { change: cur >= 0 ? 'positive' as const : 'negative' as const, percentage: cur > 0 ? 100 : 0 };
    const pct = ((cur - prev) / prev) * 100;
    return { change: (pct >= 0 ? 'positive' : 'negative') as 'positive' | 'negative', percentage: Math.round(Math.abs(pct) * 100) / 100 };
  };

  // Gift card
  const [gcCnt, gcPrev] = await Promise.all([
    prisma.giftCardOrder.count({ where: curWhere }),
    prisma.giftCardOrder.count({ where: prevWhere }),
  ]);
  const [gcSum, gcPrevSum] = await Promise.all([
    prisma.giftCardOrder.aggregate({ where: curWhere, _sum: { totalAmount: true } }),
    prisma.giftCardOrder.aggregate({ where: prevWhere, _sum: { totalAmount: true } }),
  ]);

  // Crypto
  const [crCnt, crPrev] = await Promise.all([
    prisma.cryptoTransaction.count({ where: curWhere }),
    prisma.cryptoTransaction.count({ where: prevWhere }),
  ]);
  const [crBuySum, crSellSum] = await Promise.all([
    prisma.cryptoBuy.aggregate({ where: { cryptoTransaction: curWhere }, _sum: { amountUsd: true, amountNaira: true } }),
    prisma.cryptoSell.aggregate({ where: { cryptoTransaction: curWhere }, _sum: { amountUsd: true, amountNaira: true } }),
  ]);
  const crSumUsd = Number(crBuySum._sum.amountUsd || 0) + Number(crSellSum._sum.amountUsd || 0);
  const crSumNaira = Number(crBuySum._sum.amountNaira || 0) + Number(crSellSum._sum.amountNaira || 0);

  // Bill payments
  const [bpCnt, bpPrev] = await Promise.all([
    prisma.billPayment.count({ where: curWhere }),
    prisma.billPayment.count({ where: prevWhere }),
  ]);
  const [bpSum, bpPrevSum] = await Promise.all([
    prisma.billPayment.aggregate({ where: curWhere, _sum: { amount: true } }),
    prisma.billPayment.aggregate({ where: prevWhere, _sum: { amount: true } }),
  ]);

  // Naira
  const nairaBase = { billType: null as any, type: { in: ['deposit', 'withdrawal', 'transfer', 'credit', 'debit'] } };
  const [naCnt, naPrev] = await Promise.all([
    prisma.fiatTransaction.count({ where: { ...curWhere, ...nairaBase } }),
    prisma.fiatTransaction.count({ where: { ...prevWhere, ...nairaBase } }),
  ]);
  const [naSum, naPrevSum] = await Promise.all([
    prisma.fiatTransaction.aggregate({ where: { ...curWhere, ...nairaBase }, _sum: { totalAmount: true } }),
    prisma.fiatTransaction.aggregate({ where: { ...prevWhere, ...nairaBase }, _sum: { totalAmount: true } }),
  ]);

  const totalCnt = gcCnt + crCnt + bpCnt + naCnt;
  const prevTotalCnt = gcPrev + crPrev + bpPrev + naPrev;
  const gcAmt = Number(gcSum._sum.totalAmount || 0);
  const bpAmt = Number(bpSum._sum.amount || 0);
  const naAmt = Number(naSum._sum.totalAmount || 0);
  const gcPrevAmt = Number(gcPrevSum._sum.totalAmount || 0);
  const bpPrevAmt = Number(bpPrevSum._sum.amount || 0);
  const naPrevAmt = Number(naPrevSum._sum.totalAmount || 0);

  return {
    totalTransactions: { count: totalCnt, ...calc(totalCnt, prevTotalCnt) },
    totalTransactionAmountSum: {
      _sum: { amount: gcAmt + crSumUsd, amountNaira: crSumNaira + bpAmt + naAmt },
      ...calc(gcAmt + crSumUsd + bpAmt + naAmt, gcPrevAmt + bpPrevAmt + naPrevAmt),
    },
    cryptoTransactions: {
      _count: crCnt, _sum: { amount: crSumUsd, amountNaira: crSumNaira },
      ...calc(crCnt, crPrev),
    },
    giftCardTransactions: {
      _count: gcCnt, _sum: { amount: gcAmt, amountNaira: 0 },
      ...calc(gcCnt, gcPrev),
    },
    billPaymentTransactions: {
      _count: bpCnt, _sum: { amount: 0, amountNaira: bpAmt },
      ...calc(bpCnt, bpPrev),
    },
    nairaTransactions: {
      _count: naCnt, _sum: { amount: 0, amountNaira: naAmt },
      ...calc(naCnt, naPrev),
    },
  };
}
