import { prisma } from '../../utils/prisma';
import { enqueueDepositVerifyRetry } from '../tatum/deposit.pending.service';
import { isDepositVerifyEnabled } from '../tatum/deposit.onchain.verifier/chain.registry';
import type { DepositCreditContext } from '../tatum/deposit.credit.service';

export type DepositVerificationLogRow = {
  id: number;
  txHash: string;
  chain: string;
  userId: number;
  userEmail: string | null;
  userName: string | null;
  virtualAccountId: number;
  status: string;
  attempts: number;
  nextRetryAt: string | null;
  webhookAmount: string | null;
  onChainAmount: string | null;
  contractAddress: string | null;
  depositAddress: string | null;
  provider: string | null;
  failureReason: string | null;
  currency: string | null;
  receivedAssetId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DepositVerificationLogDetail = DepositVerificationLogRow & {
  accountId: string | null;
  rawSnippet: unknown;
  payload: DepositCreditContext | null;
};

function mapRow(
  row: {
    id: number;
    txHash: string;
    chain: string;
    userId: number;
    virtualAccountId: number;
    status: string;
    attempts: number;
    nextRetryAt: Date | null;
    webhookAmount: string | null;
    onChainAmount: string | null;
    contractAddress: string | null;
    depositAddress: string | null;
    provider: string | null;
    failureReason: string | null;
    receivedAssetId: number | null;
    createdAt: Date;
    updatedAt: Date;
    payload: unknown;
  },
  user?: { email: string; firstname: string; lastname: string } | null
): DepositVerificationLogRow {
  const payload = row.payload as DepositCreditContext | null;
  return {
    id: row.id,
    txHash: row.txHash,
    chain: row.chain,
    userId: row.userId,
    userEmail: user?.email ?? null,
    userName: user ? `${user.firstname} ${user.lastname}`.trim() : null,
    virtualAccountId: row.virtualAccountId,
    status: row.status,
    attempts: row.attempts,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
    webhookAmount: row.webhookAmount,
    onChainAmount: row.onChainAmount,
    contractAddress: row.contractAddress,
    depositAddress: row.depositAddress,
    provider: row.provider,
    failureReason: row.failureReason,
    currency: payload?.currency ?? null,
    receivedAssetId: row.receivedAssetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDepositVerificationLogs(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.status && params.status !== 'all') {
    where.status = params.status;
  }
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { txHash: { contains: q } },
      { depositAddress: { contains: q } },
      { contractAddress: { contains: q } },
      { chain: { contains: q } },
    ];
  }

  const [rows, total, statusGroups] = await Promise.all([
    prisma.depositVerification.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.depositVerification.count({ where }),
    prisma.depositVerification.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstname: true, lastname: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const countsByStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    countsByStatus[g.status] = g._count.status;
  }

  return {
    verifyEnabled: isDepositVerifyEnabled(),
    workerQueue: 'default',
    workerJob: 'retry-deposit-verification',
    countsByStatus,
    items: rows.map((r) => mapRow(r, userMap.get(r.userId) ?? null)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getDepositVerificationLog(id: number): Promise<DepositVerificationLogDetail | null> {
  const row = await prisma.depositVerification.findUnique({ where: { id } });
  if (!row) return null;

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { email: true, firstname: true, lastname: true },
  });

  const base = mapRow(row, user);
  return {
    ...base,
    accountId: row.accountId,
    rawSnippet: row.rawSnippet,
    payload: (row.payload as DepositCreditContext | null) ?? null,
  };
}

export async function retryDepositVerification(id: number): Promise<void> {
  const row = await prisma.depositVerification.findUnique({ where: { id } });
  if (!row) {
    throw new Error('Deposit verification not found');
  }
  if (row.status === 'verified') {
    throw new Error('Deposit already verified');
  }
  await prisma.depositVerification.update({
    where: { id },
    data: {
      status: 'pending',
      nextRetryAt: new Date(),
    },
  });
  await enqueueDepositVerifyRetry(id, row.attempts + 1);
}
