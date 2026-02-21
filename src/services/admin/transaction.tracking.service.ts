import { prisma } from '../../utils/prisma';
import { CryptoTxType } from '@prisma/client';

export interface TrackingListItem {
  id: string;
  name: string;
  status: string;
  txId: string;
  type: string;
  amount: string;
  date: string;
  txType: string;
}

export interface TrackingStep {
  title: string;
  crypto?: string;
  network?: string;
  route?: string;
  action?: string;
  date?: string;
  fromAddress?: string;
  address?: string;
  toAddress?: string;
  transactionHash?: string;
  txHash?: string;
  status?: string;
}

export interface TrackingDetails {
  amountDollar: string;
  amountNaira: string;
  serviceType: string;
  cryptoType: string;
  cryptoChain: string;
  cryptoAmount: string;
  sendAddress: string;
  receiverAddress: string;
  transactionHash: string;
  transactionId: string;
  transactionStatus: string;
}

export async function getTransactionTrackingList(filters: {
  txType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: TrackingListItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (filters.txType) {
    const txType = filters.txType.toUpperCase();
    if (['SEND', 'RECEIVE', 'BUY', 'SELL', 'SWAP'].includes(txType)) {
      where.transactionType = txType as CryptoTxType;
    }
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { transactionId: { contains: q } },
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { email: { contains: q } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.cryptoTransaction.findMany({
      where,
      include: {
        user: { select: { firstname: true, lastname: true } },
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

  const items: TrackingListItem[] = rows.map((tx) => {
    let amount = '0';
    if (tx.cryptoBuy) amount = tx.cryptoBuy.amountUsd?.toString() ?? tx.cryptoBuy.amount.toString();
    else if (tx.cryptoSell) amount = tx.cryptoSell.amountUsd?.toString() ?? tx.cryptoSell.amount.toString();
    else if (tx.cryptoSend) amount = tx.cryptoSend.amountUsd?.toString() ?? tx.cryptoSend.amount.toString();
    else if (tx.cryptoReceive) amount = tx.cryptoReceive.amountUsd?.toString() ?? tx.cryptoReceive.amount.toString();
    else if (tx.cryptoSwap) amount = tx.cryptoSwap.fromAmountUsd?.toString() ?? tx.cryptoSwap.fromAmount.toString();
    const name = tx.user ? `${tx.user.firstname} ${tx.user.lastname}`.trim() : '';
    return {
      id: tx.transactionId,
      name,
      status: tx.status,
      txId: tx.transactionId,
      type: tx.transactionType,
      amount,
      date: tx.createdAt.toISOString(),
      txType: tx.transactionType,
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
    include: {
      cryptoBuy: true,
      cryptoSell: true,
      cryptoSend: true,
      cryptoReceive: true,
      cryptoSwap: true,
    },
  });
  if (!tx) return [];
  const steps: TrackingStep[] = [];
  steps.push({
    title: 'Transaction created',
    crypto: tx.currency,
    network: tx.blockchain,
    date: tx.createdAt.toISOString(),
    status: tx.status,
  });
  if (tx.cryptoSend) {
    steps.push({
      title: 'Send',
      fromAddress: tx.cryptoSend.fromAddress,
      toAddress: tx.cryptoSend.toAddress,
      transactionHash: tx.cryptoSend.txHash ?? undefined,
      txHash: tx.cryptoSend.txHash ?? undefined,
      status: tx.status,
      date: tx.updatedAt.toISOString(),
    });
  } else if (tx.cryptoReceive) {
    steps.push({
      title: 'Receive',
      fromAddress: tx.cryptoReceive.fromAddress,
      toAddress: tx.cryptoReceive.toAddress,
      transactionHash: tx.cryptoReceive.txHash ?? undefined,
      txHash: tx.cryptoReceive.txHash ?? undefined,
      status: tx.status,
      date: tx.updatedAt.toISOString(),
    });
  } else if (tx.cryptoBuy || tx.cryptoSell || tx.cryptoSwap) {
    const child = tx.cryptoBuy || tx.cryptoSell || tx.cryptoSwap;
    if (child && 'txHash' in child && child.txHash) {
      steps.push({
        title: tx.transactionType,
        transactionHash: child.txHash,
        txHash: child.txHash,
        status: tx.status,
        date: tx.updatedAt.toISOString(),
      });
    }
  }
  return steps;
}

export async function getTrackingDetails(txId: string): Promise<TrackingDetails | null> {
  const tx = await prisma.cryptoTransaction.findUnique({
    where: { transactionId: txId },
    include: {
      cryptoBuy: true,
      cryptoSell: true,
      cryptoSend: true,
      cryptoReceive: true,
      cryptoSwap: true,
    },
  });
  if (!tx) return null;
  let amountDollar = '0';
  let amountNaira = '0';
  let cryptoAmount = '0';
  let sendAddress = '';
  let receiverAddress = '';
  let transactionHash = '';
  if (tx.cryptoBuy) {
    amountDollar = tx.cryptoBuy.amountUsd?.toString() ?? '0';
    amountNaira = tx.cryptoBuy.amountNaira?.toString() ?? '0';
    cryptoAmount = tx.cryptoBuy.amount?.toString() ?? '0';
    sendAddress = tx.cryptoBuy.fromAddress ?? '';
    receiverAddress = tx.cryptoBuy.toAddress ?? '';
    transactionHash = tx.cryptoBuy.txHash ?? '';
  } else if (tx.cryptoSell) {
    amountDollar = tx.cryptoSell.amountUsd?.toString() ?? '0';
    amountNaira = tx.cryptoSell.amountNaira?.toString() ?? '0';
    cryptoAmount = tx.cryptoSell.amount?.toString() ?? '0';
    sendAddress = tx.cryptoSell.fromAddress ?? '';
    receiverAddress = tx.cryptoSell.toAddress ?? '';
    transactionHash = tx.cryptoSell.txHash ?? '';
  } else if (tx.cryptoSend) {
    amountDollar = tx.cryptoSend.amountUsd?.toString() ?? '0';
    amountNaira = tx.cryptoSend.amountNaira?.toString() ?? '0';
    cryptoAmount = tx.cryptoSend.amount?.toString() ?? '0';
    sendAddress = tx.cryptoSend.fromAddress ?? '';
    receiverAddress = tx.cryptoSend.toAddress ?? '';
    transactionHash = tx.cryptoSend.txHash ?? '';
  } else if (tx.cryptoReceive) {
    amountDollar = tx.cryptoReceive.amountUsd?.toString() ?? '0';
    amountNaira = tx.cryptoReceive.amountNaira?.toString() ?? '0';
    cryptoAmount = tx.cryptoReceive.amount?.toString() ?? '0';
    sendAddress = tx.cryptoReceive.fromAddress ?? '';
    receiverAddress = tx.cryptoReceive.toAddress ?? '';
    transactionHash = tx.cryptoReceive.txHash ?? '';
  } else if (tx.cryptoSwap) {
    amountDollar = tx.cryptoSwap.totalAmountUsd?.toString() ?? '0';
    cryptoAmount = tx.cryptoSwap.fromAmount?.toString() ?? '0';
    transactionHash = tx.cryptoSwap.txHash ?? '';
  }
  return {
    amountDollar,
    amountNaira,
    serviceType: tx.transactionType,
    cryptoType: tx.currency,
    cryptoChain: tx.blockchain,
    cryptoAmount,
    sendAddress,
    receiverAddress,
    transactionHash,
    transactionId: tx.transactionId,
    transactionStatus: tx.status,
  };
}
