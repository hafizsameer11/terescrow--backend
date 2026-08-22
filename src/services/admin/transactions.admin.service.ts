import { prisma } from '../../utils/prisma';

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
  giftCardProvider: string | null;
  billType: string | null;
  billReference: string | null;
  billProvider: string | null;
  nairaType: string | null;
  nairaChannel: string | null;
  nairaReference: string | null;
  exchangeRate?: number | null;
  /** Provider source of truth: busha | strowallet | palmpay | pagocard | reloadly */
  provider?: string | null;
  side?: string | null;
  sourceCurrency?: string | null;
  targetCurrency?: string | null;
  sourceAmount?: number | null;
  targetAmount?: number | null;
  sceneCode?: string | null;
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

const ACTIVE_BILL_PROVIDERS = ['strowallet', 'palmpay'] as const;

const NAIRA_TYPES = ['DEPOSIT', 'WITHDRAW', 'WITHDRAWAL', 'TRANSFER', 'credit', 'debit', 'deposit', 'withdrawal'] as const;

const NULL_TYPE_FIELDS = {
  fromAddress: null as string | null,
  toAddress: null as string | null,
  cardType: null as string | null,
  cardNumber: null as string | null,
  giftCardSubType: null as string | null,
  giftCardProvider: null as string | null,
  billType: null as string | null,
  billReference: null as string | null,
  billProvider: null as string | null,
  nairaType: null as string | null,
  nairaChannel: null as string | null,
  nairaReference: null as string | null,
  provider: null as string | null,
  side: null as string | null,
  sourceCurrency: null as string | null,
  targetCurrency: null as string | null,
  sourceAmount: null as number | null,
  targetAmount: null as number | null,
  sceneCode: null as string | null,
};

function toDate(s?: string, endOfDay = false): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeStatus(dbStatus: string): string {
  const s = String(dbStatus || '').toLowerCase();
  if (s === 'completed' || s === 'wallet_credited' || s === 'funds_received' || s === 'funds_converted') {
    return 'successful';
  }
  if (s === 'cancelled' || s === 'canceled' || s === 'refunded' || s === 'failed' || s === 'buy_reversed') {
    return 'declined';
  }
  if (s === 'processing' || s === 'pending' || s === 'awaiting_payment' || s === 'awaiting_deposit') {
    return 'pending';
  }
  if (s === 'successful' || s === 'declined' || s === 'pending') return s;
  return s || 'pending';
}

function statusToDbValues(s: string): string[] {
  if (s === 'successful') {
    return ['successful', 'completed', 'wallet_credited', 'funds_received', 'funds_converted'];
  }
  if (s === 'declined') {
    return ['declined', 'failed', 'cancelled', 'canceled', 'refunded', 'buy_reversed'];
  }
  if (s === 'pending') {
    return ['pending', 'processing', 'awaiting_payment', 'awaiting_deposit'];
  }
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

function parseGiftCardMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function giftCardProviderFromOrder(o: any): string {
  const meta = parseGiftCardMetadata(o.metadata);
  const fromMeta = String(meta.provider || '').toLowerCase();
  if (fromMeta) return fromMeta;
  if (o.reloadlyOrderId || o.reloadlyTransactionId) return 'reloadly';
  return 'pagocard';
}

function isCryptoLinkedFiatType(type: string): boolean {
  return String(type || '').toUpperCase().startsWith('CRYPTO_');
}

function isBillLinkedFiatType(type: string): boolean {
  const t = String(type || '').toUpperCase();
  return t === 'BILL_PAYMENT' || t === 'BILLPAYMENT' || t === 'BILL';
}

function mapBushaSideToDept(side: string): { title: string; Type: 'buy' | 'sell' } {
  const s = String(side || '').toLowerCase();
  if (s === 'buy') return { title: 'Buy Crypto', Type: 'buy' };
  if (s === 'sell') return { title: 'Sell Crypto', Type: 'sell' };
  if (s === 'receive' || s === 'cryptorecv') return { title: 'Receive Crypto', Type: 'buy' };
  if (s === 'send' || s === 'cryptosend') return { title: 'Send Crypto', Type: 'sell' };
  if (s === 'convert' || s === 'swap') return { title: 'Swap Crypto', Type: 'buy' };
  return { title: 'Crypto', Type: 'buy' };
}

function parseAmount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Gift Card (Pagocard / Reloadly) ──

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
  const provider = giftCardProviderFromOrder(o);
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
      subTitle: provider,
      image: o.product?.reloadlyImageUrl ?? null,
    },
    subCategory: null,
    customer: mapUser(o.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    cardType: o.cardType ?? null,
    cardNumber: o.cardNumber ?? null,
    giftCardProvider: provider,
    provider,
    exchangeRate: rate || null,
  };
}

// ── Crypto (BushaTradeLog) ──

async function queryCrypto(f: TransactionFilters, take: number, skip: number) {
  const where: any = {};
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) {
    const statuses = statusToDbValues(f.status);
    if (statuses.length) {
      where.OR = [
        { status: { in: statuses } },
        { bushaStatus: { in: statuses } },
      ];
    }
  }
  if (f.customerId) where.userId = f.customerId;
  if (f.type === 'buy') {
    where.side = { in: ['buy', 'receive', 'cryptorecv', 'convert', 'swap'] };
  } else if (f.type === 'sell') {
    where.side = { in: ['sell', 'send', 'cryptosend'] };
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    const searchOr: any[] = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { id: { contains: q } },
      { bushaTransferId: { contains: q } },
      { bushaQuoteId: { contains: q } },
      { sourceCurrency: { contains: q } },
      { targetCurrency: { contains: q } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  const [rows, count] = await Promise.all([
    prisma.bushaTradeLog.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: {
        user: { select: USER_SELECT },
      },
    }),
    prisma.bushaTradeLog.count({ where }),
  ]);
  return { rows, count };
}

function mapCrypto(t: any): UnifiedTransaction {
  const side = String(t.side || '').toLowerCase();
  const source = String(t.sourceCurrency || '').toUpperCase();
  const target = String(t.targetCurrency || '').toUpperCase();
  const sourceAmount = parseAmount(t.sourceAmount);
  const targetAmount = t.targetAmount != null ? parseAmount(t.targetAmount) : 0;
  const dept = mapBushaSideToDept(side);

  let amount = sourceAmount;
  let amountNaira = 0;

  if (side === 'buy') {
    amount = targetAmount || sourceAmount;
    amountNaira = source === 'NGN' ? sourceAmount : 0;
  } else if (side === 'sell') {
    amount = sourceAmount;
    amountNaira = target === 'NGN' ? targetAmount : 0;
  } else {
    amount = sourceAmount;
  }

  const pairTitle =
    side === 'convert' || side === 'swap'
      ? `${source}→${target}`
      : side === 'buy'
        ? target || source
        : source || target;

  return {
    id: t.id,
    transactionId: t.bushaTransferId || t.id,
    status: normalizeStatus(t.status || t.bushaStatus || 'pending'),
    amount: Math.round(amount * 1e8) / 1e8,
    amountNaira: Math.round(amountNaira * 100) / 100,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    profit: 0,
    department: { id: 0, title: dept.title, niche: 'crypto', Type: dept.Type },
    category: {
      id: 0,
      title: pairTitle,
      subTitle: `${source} → ${target}`,
      image: null,
    },
    subCategory: null,
    customer: mapUser(t.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    fromAddress: t.cryptoDepositAddress ?? null,
    toAddress: null,
    provider: 'busha',
    side,
    sourceCurrency: source,
    targetCurrency: target,
    sourceAmount,
    targetAmount: targetAmount || null,
  };
}

// ── Bill Payment (StroWallet + PalmPay betting) ──

async function queryBillPayments(f: TransactionFilters, take: number, skip: number) {
  if (f.type === 'sell') return { rows: [] as any[], count: 0 };
  const where: any = {
    provider: { in: [...ACTIVE_BILL_PROVIDERS] },
  };
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
      { sceneCode: { contains: q } },
      { palmpayOrderId: { contains: q } },
      { palmpayOrderNo: { contains: q } },
      { billReference: { contains: q } },
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
  const provider = String(b.provider || '').toLowerCase() || null;
  const ref = b.billReference || b.palmpayOrderNo || b.palmpayOrderId || null;
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
    category: {
      id: 0,
      title: b.billType ?? b.sceneCode ?? 'Bill Payment',
      subTitle: b.billerName ?? b.itemName ?? null,
      image: null,
    },
    subCategory: b.itemName ? { id: 0, title: b.itemName } : null,
    customer: mapUser(b.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    billType: b.billType ?? b.sceneCode ?? null,
    billReference: ref,
    billProvider: provider,
    provider,
    sceneCode: b.sceneCode ?? null,
  };
}

// ── Naira (PalmPay deposits/withdrawals — not crypto/bill legs) ──

function nairaWhereBase(): any {
  return {
    billType: null,
    NOT: [
      { type: { startsWith: 'CRYPTO_' } },
      { type: { in: ['BILL_PAYMENT', 'BILLPAYMENT', 'BILL'] } },
    ],
  };
}

async function queryNaira(f: TransactionFilters, take: number, skip: number) {
  const where: any = { ...nairaWhereBase() };
  const df = buildDateFilter(f.startDate, f.endDate);
  if (df) where.createdAt = df;
  if (f.status) where.status = { in: statusToDbValues(f.status) };
  if (f.customerId) where.userId = f.customerId;
  if (f.type === 'buy') {
    where.type = { in: ['DEPOSIT', 'deposit', 'credit'] };
  } else if (f.type === 'sell') {
    where.type = { in: ['WITHDRAW', 'WITHDRAWAL', 'withdrawal', 'debit'] };
  } else {
    where.type = { in: [...NAIRA_TYPES] };
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { username: { contains: q } } },
      { id: { contains: q } },
      { palmpayOrderNo: { contains: q } },
      { palmpayOrderId: { contains: q } },
    ];
  }

  const [rows, count] = await Promise.all([
    prisma.fiatTransaction.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT } },
    }),
    prisma.fiatTransaction.count({ where }),
  ]);

  // Extra safety filter for CRYPTO_/BILL if DB dialect quirks
  const filtered = rows.filter(
    (r) => !isCryptoLinkedFiatType(r.type) && !isBillLinkedFiatType(r.type)
  );
  return { rows: filtered, count };
}

function mapNaira(f: any): UnifiedTransaction {
  const fiatAmount = Number(f.amount || 0);
  const totalAmt = Number(f.totalAmount || f.amount || 0);
  const currency = String(f.currency || 'NGN').toUpperCase();
  const isUsd = currency === 'USD';
  const t = String(f.type || '').toUpperCase();
  const deptType = ['DEPOSIT', 'CREDIT'].includes(t) ? 'buy' : 'sell';
  return {
    id: f.id,
    transactionId: f.id,
    status: normalizeStatus(f.status),
    amount: isUsd ? fiatAmount : 0,
    amountNaira: isUsd ? 0 : totalAmt,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    profit: 0,
    department: { id: 0, title: 'Naira', niche: 'naira', Type: deptType },
    category: { id: 0, title: f.type ?? 'Naira', subTitle: 'palmpay', image: null },
    subCategory: null,
    customer: mapUser(f.user),
    agent: null,
    ...NULL_TYPE_FIELDS,
    nairaType: f.type ?? null,
    nairaChannel: f.description ?? null,
    nairaReference: f.palmpayOrderNo ?? f.palmpayOrderId ?? null,
    provider: 'palmpay',
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

  const billCurWhere = { ...curWhere, provider: { in: [...ACTIVE_BILL_PROVIDERS] } };
  const billPrevWhere = { ...prevWhere, provider: { in: [...ACTIVE_BILL_PROVIDERS] } };
  const nairaCurWhere = { ...curWhere, ...nairaWhereBase(), type: { in: [...NAIRA_TYPES] } };
  const nairaPrevWhere = { ...prevWhere, ...nairaWhereBase(), type: { in: [...NAIRA_TYPES] } };

  const [gcCnt, gcPrev] = await Promise.all([
    prisma.giftCardOrder.count({ where: curWhere }),
    prisma.giftCardOrder.count({ where: prevWhere }),
  ]);
  const [gcSum, gcPrevSum] = await Promise.all([
    prisma.giftCardOrder.aggregate({ where: curWhere, _sum: { totalAmount: true } }),
    prisma.giftCardOrder.aggregate({ where: prevWhere, _sum: { totalAmount: true } }),
  ]);

  const [crCnt, crPrev] = await Promise.all([
    prisma.bushaTradeLog.count({ where: curWhere }),
    prisma.bushaTradeLog.count({ where: prevWhere }),
  ]);
  const crRows = await prisma.bushaTradeLog.findMany({
    where: curWhere,
    select: { side: true, sourceCurrency: true, targetCurrency: true, sourceAmount: true, targetAmount: true },
    take: 5000,
  });
  let crSumUsd = 0;
  let crSumNaira = 0;
  for (const t of crRows) {
    const side = String(t.side || '').toLowerCase();
    const source = String(t.sourceCurrency || '').toUpperCase();
    const target = String(t.targetCurrency || '').toUpperCase();
    const sourceAmount = parseAmount(t.sourceAmount);
    const targetAmount = t.targetAmount != null ? parseAmount(t.targetAmount) : 0;
    if (side === 'buy') {
      crSumUsd += targetAmount || sourceAmount;
      if (source === 'NGN') crSumNaira += sourceAmount;
    } else if (side === 'sell') {
      crSumUsd += sourceAmount;
      if (target === 'NGN') crSumNaira += targetAmount;
    } else {
      crSumUsd += sourceAmount;
    }
  }

  const [bpCnt, bpPrev] = await Promise.all([
    prisma.billPayment.count({ where: billCurWhere }),
    prisma.billPayment.count({ where: billPrevWhere }),
  ]);
  const [bpSum, bpPrevSum] = await Promise.all([
    prisma.billPayment.aggregate({ where: billCurWhere, _sum: { amount: true } }),
    prisma.billPayment.aggregate({ where: billPrevWhere, _sum: { amount: true } }),
  ]);

  const [naCnt, naPrev] = await Promise.all([
    prisma.fiatTransaction.count({ where: nairaCurWhere }),
    prisma.fiatTransaction.count({ where: nairaPrevWhere }),
  ]);
  const [naSum, naPrevSum] = await Promise.all([
    prisma.fiatTransaction.aggregate({ where: nairaCurWhere, _sum: { totalAmount: true } }),
    prisma.fiatTransaction.aggregate({ where: nairaPrevWhere, _sum: { totalAmount: true } }),
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
