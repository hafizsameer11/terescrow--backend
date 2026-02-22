import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';

export interface TrackingListItem {
  id: number;
  transactionId: string;
  customerName: string;
  customerEmail: string;
  customerId: number;
  status: string;
  masterWalletStatus: string;
  txHash: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  currency: string;
  blockchain: string;
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  blockNumber: string | null;
  date: string;
}

export interface TrackingStep {
  title: string;
  status: string;
  date: string;
  details: Record<string, string | number | null>;
}

export interface TrackingDetails {
  transactionId: string;
  status: string;
  masterWalletStatus: string;
  currency: string;
  blockchain: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  blockNumber: string | null;
  confirmations: number;
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    username: string;
    profilePicture: string | null;
  } | null;
  receivedAsset: {
    id: number;
    accountId: string | null;
    status: string;
    reference: string | null;
    index: number | null;
    transactionDate: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

function buildDateFilter(startDate?: string, endDate?: string): Prisma.CryptoTransactionWhereInput {
  if (!startDate && !endDate) return {};
  const filter: any = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return { createdAt: filter };
}

export async function getTransactionTrackingList(filters: {
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: TrackingListItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.CryptoTransactionWhereInput = {
    transactionType: 'RECEIVE',
    cryptoReceive: { isNot: null },
    ...buildDateFilter(filters.startDate, filters.endDate),
  };

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { transactionId: { contains: q } },
      { cryptoReceive: { txHash: { contains: q } } },
      { cryptoReceive: { fromAddress: { contains: q } } },
      { cryptoReceive: { toAddress: { contains: q } } },
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { email: { contains: q } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.cryptoTransaction.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
        cryptoReceive: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.cryptoTransaction.count({ where }),
  ]);

  const txHashes = rows
    .map((r) => r.cryptoReceive?.txHash)
    .filter((h): h is string => !!h);

  const receivedAssets = txHashes.length
    ? await prisma.receivedAsset.findMany({
        where: { txId: { in: txHashes } },
        select: { txId: true, status: true },
      })
    : [];

  const assetStatusMap = new Map(
    receivedAssets.map((a) => [a.txId, a.status])
  );

  const items: TrackingListItem[] = rows.map((tx) => {
    const recv = tx.cryptoReceive!;
    const masterStatus = assetStatusMap.get(recv.txHash) ?? 'unknown';
    return {
      id: tx.id,
      transactionId: tx.transactionId,
      customerName: tx.user
        ? `${tx.user.firstname} ${tx.user.lastname}`.trim()
        : '',
      customerEmail: tx.user?.email ?? '',
      customerId: tx.userId,
      status: tx.status,
      masterWalletStatus: masterStatus,
      txHash: recv.txHash,
      amount: recv.amount.toString(),
      amountUsd: recv.amountUsd.toString(),
      amountNaira: recv.amountNaira?.toString() ?? '0',
      currency: tx.currency,
      blockchain: tx.blockchain,
      fromAddress: recv.fromAddress,
      toAddress: recv.toAddress,
      confirmations: recv.confirmations ?? 0,
      blockNumber: recv.blockNumber?.toString() ?? null,
      date: tx.createdAt.toISOString(),
    };
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getTrackingSteps(txId: string): Promise<TrackingStep[]> {
  const tx = await prisma.cryptoTransaction.findUnique({
    where: { transactionId: txId },
    include: { cryptoReceive: true },
  });
  if (!tx || !tx.cryptoReceive) return [];

  const recv = tx.cryptoReceive;

  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });

  const steps: TrackingStep[] = [];

  steps.push({
    title: 'On-chain deposit detected',
    status: 'completed',
    date: tx.createdAt.toISOString(),
    details: {
      txHash: recv.txHash,
      fromAddress: recv.fromAddress,
      toAddress: recv.toAddress,
      amount: recv.amount.toString(),
      currency: tx.currency,
      blockchain: tx.blockchain,
      blockNumber: recv.blockNumber?.toString() ?? null,
    },
  });

  steps.push({
    title: 'Confirmations',
    status: (recv.confirmations ?? 0) > 0 ? 'completed' : 'pending',
    date: tx.updatedAt.toISOString(),
    details: {
      confirmations: recv.confirmations ?? 0,
    },
  });

  steps.push({
    title: 'Credited to user wallet',
    status: tx.status === 'successful' ? 'completed' : tx.status,
    date: tx.updatedAt.toISOString(),
    details: {
      amountUsd: recv.amountUsd.toString(),
      amountNaira: recv.amountNaira?.toString() ?? null,
      accountId: receivedAsset?.accountId ?? null,
    },
  });

  const masterStatus = receivedAsset?.status ?? 'unknown';
  steps.push({
    title: 'Transfer to master wallet',
    status: masterStatus === 'transferredToMaster' ? 'completed' : 'pending',
    date: receivedAsset?.updatedAt?.toISOString() ?? tx.updatedAt.toISOString(),
    details: {
      masterWalletStatus: masterStatus,
    },
  });

  return steps;
}

export async function getTrackingDetails(txId: string): Promise<TrackingDetails | null> {
  const tx = await prisma.cryptoTransaction.findUnique({
    where: { transactionId: txId },
    include: {
      cryptoReceive: true,
      user: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          username: true,
          profilePicture: true,
        },
      },
    },
  });
  if (!tx || !tx.cryptoReceive) return null;

  const recv = tx.cryptoReceive;

  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });

  return {
    transactionId: tx.transactionId,
    status: tx.status,
    masterWalletStatus: receivedAsset?.status ?? 'unknown',
    currency: tx.currency,
    blockchain: tx.blockchain,
    amount: recv.amount.toString(),
    amountUsd: recv.amountUsd.toString(),
    amountNaira: recv.amountNaira?.toString() ?? '0',
    fromAddress: recv.fromAddress,
    toAddress: recv.toAddress,
    txHash: recv.txHash,
    blockNumber: recv.blockNumber?.toString() ?? null,
    confirmations: recv.confirmations ?? 0,
    customer: tx.user
      ? {
          id: tx.user.id,
          firstname: tx.user.firstname,
          lastname: tx.user.lastname,
          email: tx.user.email,
          username: tx.user.username,
          profilePicture: tx.user.profilePicture,
        }
      : null,
    receivedAsset: receivedAsset
      ? {
          id: receivedAsset.id,
          accountId: receivedAsset.accountId,
          status: receivedAsset.status,
          reference: receivedAsset.reference,
          index: receivedAsset.index,
          transactionDate: receivedAsset.transactionDate?.toISOString() ?? null,
        }
      : null,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}
