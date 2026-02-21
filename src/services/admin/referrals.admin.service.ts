import { prisma } from '../../utils/prisma';
import { UserRoles } from '@prisma/client';

const DEFAULT_EARN_SETTINGS = {
  firstTimeDepositBonusPct: 0,
  commissionReferralTradesPct: 0,
  commissionDownlineTradesPct: 0,
};

export async function getReferralSummary(filters?: { startDate?: string; endDate?: string }) {
  const [allUsers, referredCount] = await Promise.all([
    prisma.user.count({ where: { role: UserRoles.customer } }),
    prisma.user.count({ where: { referredBy: { not: null } } }),
  ]);
  const amountPaidOut = 0;
  return {
    allUsers,
    allUsersTrend: undefined,
    totalReferred: referredCount,
    amountPaidOut,
  };
}

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
  const rows: ReferralRow[] = users.map((u) => ({
    id: u.id,
    name: `${u.firstname} ${u.lastname}`.trim() || u.email,
    email: u.email,
    joined: u.createdAt.toISOString(),
    noOfReferrals: u._count.referrals,
    downlineReferrals: 0,
    amountEarned: 0,
  }));
  return {
    rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

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
  const giftCardCount = await prisma.giftCardOrder.count({
    where: { userId: { in: referred.map((r) => r.id) } },
  });
  const cryptoTradesCount = await prisma.cryptoTransaction.count({
    where: { userId: { in: referred.map((r) => r.id) } },
  });
  return referred.map((r) => ({
    referredName: `${r.firstname} ${r.lastname}`.trim() || r.email,
    referredAt: r.createdAt.toISOString(),
    stats: {
      giftCardBuy: giftCardCount,
      giftCardSell: 0,
      cryptoTrades: cryptoTradesCount,
      noOfUsersReferred: r._count.referrals,
    },
    earned: {
      amountEarnedFromTrades: 0,
      fromGcTrades: 0,
      fromCryptoTrades: 0,
      fromDownlines: 0,
    },
  }));
}

export async function getEarnSettings() {
  let row = await prisma.referralEarnSettings.findFirst();
  if (!row) {
    row = await prisma.referralEarnSettings.create({
      data: DEFAULT_EARN_SETTINGS,
    });
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
  let row = await prisma.referralEarnSettings.findFirst();
  if (!row) {
    row = await prisma.referralEarnSettings.create({
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
  await prisma.referralEarnSettings.update({ where: { id: row.id }, data });
  return getEarnSettings();
}
