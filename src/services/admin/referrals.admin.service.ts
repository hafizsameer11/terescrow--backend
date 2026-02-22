import { prisma } from '../../utils/prisma';
import { UserRoles, ReferralService, ReferralCommissionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const earnSettingsModel = (prisma as any).referralEarnSettings;

const DEFAULT_EARN_SETTINGS = {
  firstTimeDepositBonusPct: 0,
  commissionReferralTradesPct: 0,
  commissionDownlineTradesPct: 0,
};

// ──────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────

export async function getReferralSummary(filters?: { startDate?: string; endDate?: string }) {
  const dateWhere: any = {};
  if (filters?.startDate || filters?.endDate) {
    dateWhere.createdAt = {};
    if (filters.startDate) dateWhere.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) dateWhere.createdAt.lte = new Date(filters.endDate);
  }

  const [allUsers, referredCount, totalPaidOut, totalEarned] = await Promise.all([
    prisma.user.count({ where: { role: UserRoles.customer } }),
    prisma.user.count({ where: { referredBy: { not: null } } }),
    prisma.referralWithdrawal.aggregate({
      where: { status: 'completed', ...dateWhere },
      _sum: { amount: true },
    }),
    prisma.referralEarning.aggregate({
      where: dateWhere,
      _sum: { earnedAmount: true },
    }),
  ]);

  return {
    allUsers,
    allUsersTrend: undefined,
    totalReferred: referredCount,
    amountPaidOut: Number(totalPaidOut._sum.amount || 0),
    totalEarned: Number(totalEarned._sum.earnedAmount || 0),
  };
}

// ──────────────────────────────────────────────────────
// Referral List
// ──────────────────────────────────────────────────────

export interface ReferralRow {
  id: number;
  name: string;
  email: string;
  joined: string;
  noOfReferrals: number;
  downlineReferrals: number;
  amountEarned: number;
}

export async function getReferralsList(filters: {
  type?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const where: any = { referralCode: { not: null } };
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { email: { contains: q } },
      { firstname: { contains: q } },
      { lastname: { contains: q } },
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
        createdAt: true,
        _count: { select: { referrals: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = users.map((u) => u.id);

  const earningsByUser = await prisma.referralEarning.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _sum: { earnedAmount: true },
  });

  const earningsMap = new Map(
    earningsByUser.map((e) => [e.userId, Number(e._sum.earnedAmount || 0)])
  );

  const rows: ReferralRow[] = users.map((u) => ({
    id: u.id,
    name: `${u.firstname} ${u.lastname}`.trim() || u.email,
    email: u.email,
    joined: u.createdAt.toISOString(),
    noOfReferrals: u._count.referrals,
    downlineReferrals: 0,
    amountEarned: earningsMap.get(u.id) || 0,
  }));

  return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ──────────────────────────────────────────────────────
// Referrals by User
// ──────────────────────────────────────────────────────

export async function getReferralsByUser(userId: number) {
  const referrer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstname: true, lastname: true, email: true },
  });
  if (!referrer) return null;

  const referred = await prisma.user.findMany({
    where: { referredBy: userId },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      email: true,
      createdAt: true,
      _count: { select: { referrals: true } },
    },
  });

  const referredIds = referred.map((r) => r.id);

  const [giftCardCount, cryptoTradesCount, earningsBySource] = await Promise.all([
    prisma.giftCardOrder.count({ where: { userId: { in: referredIds } } }),
    prisma.cryptoTransaction.count({ where: { userId: { in: referredIds } } }),
    prisma.referralEarning.groupBy({
      by: ['sourceUserId', 'service'],
      where: { userId, sourceUserId: { in: referredIds } },
      _sum: { earnedAmount: true },
    }),
  ]);

  const earningsMap = new Map<number, { gc: number; crypto: number; total: number }>();
  for (const row of earningsBySource) {
    const sid = row.sourceUserId!;
    const entry = earningsMap.get(sid) || { gc: 0, crypto: 0, total: 0 };
    const amt = Number(row._sum.earnedAmount || 0);
    entry.total += amt;
    if (row.service === 'GIFT_CARD_BUY' || row.service === 'GIFT_CARD_SELL') {
      entry.gc += amt;
    } else if (row.service === 'CRYPTO_BUY' || row.service === 'CRYPTO_SELL') {
      entry.crypto += amt;
    }
    earningsMap.set(sid, entry);
  }

  return referred.map((r) => {
    const earned = earningsMap.get(r.id) || { gc: 0, crypto: 0, total: 0 };
    return {
      referredName: `${r.firstname} ${r.lastname}`.trim() || r.email,
      referredAt: r.createdAt.toISOString(),
      stats: {
        giftCardBuy: giftCardCount,
        giftCardSell: 0,
        cryptoTrades: cryptoTradesCount,
        noOfUsersReferred: r._count.referrals,
      },
      earned: {
        amountEarnedFromTrades: earned.total,
        fromGcTrades: earned.gc,
        fromCryptoTrades: earned.crypto,
        fromDownlines: 0,
      },
    };
  });
}

// ──────────────────────────────────────────────────────
// Legacy Earn Settings (kept for backward compatibility)
// ──────────────────────────────────────────────────────

export async function getEarnSettings() {
  let row = await earnSettingsModel.findFirst();
  if (!row) {
    row = await earnSettingsModel.create({ data: DEFAULT_EARN_SETTINGS });
  }
  return {
    firstTimeDepositBonusPct: Number(row.firstTimeDepositBonusPct),
    commissionReferralTradesPct: Number(row.commissionReferralTradesPct),
    commissionDownlineTradesPct: Number(row.commissionDownlineTradesPct),
  };
}

export async function updateEarnSettings(body: {
  firstTimeDepositBonusPct?: number;
  commissionReferralTradesPct?: number;
  commissionDownlineTradesPct?: number;
}) {
  let row = await earnSettingsModel.findFirst();
  if (!row) {
    row = await earnSettingsModel.create({
      data: {
        firstTimeDepositBonusPct: body.firstTimeDepositBonusPct ?? 0,
        commissionReferralTradesPct: body.commissionReferralTradesPct ?? 0,
        commissionDownlineTradesPct: body.commissionDownlineTradesPct ?? 0,
      },
    });
    return getEarnSettings();
  }
  const data: any = {};
  if (body.firstTimeDepositBonusPct !== undefined) data.firstTimeDepositBonusPct = body.firstTimeDepositBonusPct;
  if (body.commissionReferralTradesPct !== undefined) data.commissionReferralTradesPct = body.commissionReferralTradesPct;
  if (body.commissionDownlineTradesPct !== undefined) data.commissionDownlineTradesPct = body.commissionDownlineTradesPct;
  await earnSettingsModel.update({ where: { id: row.id }, data });
  return getEarnSettings();
}

// ──────────────────────────────────────────────────────
// New Commission Settings (per-service)
// ──────────────────────────────────────────────────────

const ALL_SERVICES: ReferralService[] = [
  'BILL_PAYMENT',
  'GIFT_CARD_BUY',
  'GIFT_CARD_SELL',
  'CRYPTO_BUY',
  'CRYPTO_SELL',
];

export async function getCommissionSettings() {
  const settings = await prisma.referralCommissionSetting.findMany({
    orderBy: { service: 'asc' },
  });

  const settingsMap = new Map(settings.map((s) => [s.service, s]));

  return ALL_SERVICES.map((service) => {
    const s = settingsMap.get(service);
    return {
      service,
      commissionType: s?.commissionType || 'PERCENTAGE',
      commissionValue: s ? Number(s.commissionValue) : 0,
      level2Pct: s ? Number(s.level2Pct) : 30,
      signupBonus: s ? Number(s.signupBonus) : 10000,
      minFirstWithdrawal: s ? Number(s.minFirstWithdrawal) : 20000,
      isActive: s?.isActive ?? false,
    };
  });
}

export async function upsertCommissionSetting(body: {
  service: ReferralService;
  commissionType: ReferralCommissionType;
  commissionValue: number;
  level2Pct?: number;
  signupBonus?: number;
  minFirstWithdrawal?: number;
  isActive?: boolean;
}) {
  const existing = await prisma.referralCommissionSetting.findUnique({
    where: { service: body.service },
  });

  if (existing) {
    return prisma.referralCommissionSetting.update({
      where: { service: body.service },
      data: {
        commissionType: body.commissionType,
        commissionValue: body.commissionValue,
        ...(body.level2Pct !== undefined ? { level2Pct: body.level2Pct } : {}),
        ...(body.signupBonus !== undefined ? { signupBonus: body.signupBonus } : {}),
        ...(body.minFirstWithdrawal !== undefined ? { minFirstWithdrawal: body.minFirstWithdrawal } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
  }

  return prisma.referralCommissionSetting.create({
    data: {
      service: body.service,
      commissionType: body.commissionType,
      commissionValue: body.commissionValue,
      level2Pct: body.level2Pct ?? 30,
      signupBonus: body.signupBonus ?? 10000,
      minFirstWithdrawal: body.minFirstWithdrawal ?? 20000,
      isActive: body.isActive ?? true,
    },
  });
}

// ──────────────────────────────────────────────────────
// Per-User Referral Overrides (for influencers)
// ──────────────────────────────────────────────────────

export async function getUserOverrides(userId: number) {
  return prisma.userReferralOverride.findMany({
    where: { userId },
    orderBy: { service: 'asc' },
  });
}

export async function upsertUserOverride(body: {
  userId: number;
  service: ReferralService;
  commissionType: ReferralCommissionType;
  commissionValue: number;
}) {
  return prisma.userReferralOverride.upsert({
    where: {
      userId_service: { userId: body.userId, service: body.service },
    },
    update: {
      commissionType: body.commissionType,
      commissionValue: body.commissionValue,
    },
    create: {
      userId: body.userId,
      service: body.service,
      commissionType: body.commissionType,
      commissionValue: body.commissionValue,
    },
  });
}

export async function deleteUserOverride(userId: number, service: ReferralService) {
  return prisma.userReferralOverride.deleteMany({
    where: { userId, service },
  });
}
