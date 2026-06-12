import { Decimal } from '@prisma/client/runtime/library';
import { BalanceBucket, CryptoTxStatus } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  CRYPTO_TX_STATUS_REVOKED,
  DEPOSIT_STATUS_FAKE_SCAM,
  isRevokedOrFakeCryptoTxStatus,
} from '../../constants/deposit.fake';
import { creditBucketData, debitBucketData } from '../crypto/virtual.account.balance.helper';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import tatumLogger from '../../utils/tatum.logger';

const TX_INCLUDE = {
  cryptoBuy: true,
  cryptoSell: true,
  cryptoSend: true,
  cryptoReceive: true,
  virtualAccount: true,
} as const;

async function findLinkedFiatTx(
  userId: number,
  type: 'CRYPTO_SELL' | 'CRYPTO_BUY',
  amountNgn: Decimal,
  around: Date
) {
  const windowMs = 5 * 60 * 1000;
  return prisma.fiatTransaction.findFirst({
    where: {
      userId,
      type,
      status: { in: ['completed', 'successful'] },
      createdAt: {
        gte: new Date(around.getTime() - windowMs),
        lte: new Date(around.getTime() + windowMs),
      },
      amount: amountNgn,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function debitFiatWallet(userId: number, amountNgn: Decimal, description: string) {
  if (amountNgn.lte(0)) return null;
  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const balanceBefore = new Decimal(fiatWallet.balance);
  if (balanceBefore.lt(amountNgn)) {
    throw ApiError.conflict(
      `Insufficient NGN balance to reverse sell (need ₦${amountNgn.toString()}, available ₦${balanceBefore.toString()})`
    );
  }
  const balanceAfter = balanceBefore.minus(amountNgn);
  await prisma.$transaction([
    prisma.fiatWallet.update({
      where: { id: fiatWallet.id },
      data: { balance: balanceAfter },
    }),
    prisma.fiatTransaction.create({
      data: {
        userId,
        walletId: fiatWallet.id,
        type: 'CRYPTO_SELL_REVERSAL',
        status: 'completed',
        currency: 'NGN',
        amount: amountNgn,
        fees: new Decimal(0),
        totalAmount: amountNgn,
        balanceBefore,
        balanceAfter,
        description,
        completedAt: new Date(),
      },
    }),
  ]);
  return { balanceBefore: balanceBefore.toString(), balanceAfter: balanceAfter.toString() };
}

async function creditFiatWallet(userId: number, amountNgn: Decimal, description: string) {
  if (amountNgn.lte(0)) return null;
  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const balanceBefore = new Decimal(fiatWallet.balance);
  const balanceAfter = balanceBefore.plus(amountNgn);
  await prisma.$transaction([
    prisma.fiatWallet.update({
      where: { id: fiatWallet.id },
      data: { balance: balanceAfter },
    }),
    prisma.fiatTransaction.create({
      data: {
        userId,
        walletId: fiatWallet.id,
        type: 'CRYPTO_BUY_REVERSAL',
        status: 'completed',
        currency: 'NGN',
        amount: amountNgn,
        fees: new Decimal(0),
        totalAmount: amountNgn,
        balanceBefore,
        balanceAfter,
        description,
        completedAt: new Date(),
      },
    }),
  ]);
  return { balanceBefore: balanceBefore.toString(), balanceAfter: balanceAfter.toString() };
}

async function revokeReceiveTx(tx: Awaited<ReturnType<typeof loadCryptoTx>>) {
  const recv = tx.cryptoReceive!;
  const va = tx.virtualAccount;
  if (!va) throw ApiError.badRequest('Receive has no virtual account');

  const credited = new Decimal(recv.creditedAmount?.toString() ?? recv.amount.toString());
  const bucket: BalanceBucket = tx.balanceBucket === 'virtual' ? 'virtual' : 'on_chain';
  const bucketData =
    bucket === 'virtual'
      ? debitBucketData(va, 'virtual', credited)
      : debitBucketData(va, 'on_chain', credited);

  await prisma.$transaction([
    prisma.virtualAccount.update({ where: { id: va.id }, data: bucketData }),
    prisma.receivedAsset.updateMany({
      where: { txId: recv.txHash },
      data: { status: DEPOSIT_STATUS_FAKE_SCAM },
    }),
    prisma.cryptoTransaction.update({
      where: { id: tx.id },
      data: { status: CRYPTO_TX_STATUS_REVOKED as CryptoTxStatus },
    }),
    prisma.cryptoReceive.update({
      where: { id: recv.id },
      data: {
        creditedAmount: new Decimal(0),
        creditedAmountUsd: new Decimal(0),
      },
    }),
  ]);

  return { type: 'RECEIVE', creditedReversed: credited.toString(), bucket };
}

async function revokeSellTxs(txs: Awaited<ReturnType<typeof loadCryptoTx>>[]) {
  const primary = txs[0];
  let totalNgn = new Decimal(0);
  const updates: ReturnType<typeof prisma.virtualAccount.update>[] = [];

  for (const tx of txs) {
    const sell = tx.cryptoSell;
    if (!sell || !tx.virtualAccount) continue;
    const amount = new Decimal(sell.amount.toString());
    totalNgn = totalNgn.plus(new Decimal(sell.amountNaira.toString()));
    const bucket: BalanceBucket = tx.balanceBucket === 'on_chain' ? 'on_chain' : 'virtual';
    const data = creditBucketData(tx.virtualAccount, bucket, amount);
    updates.push(prisma.virtualAccount.update({ where: { id: tx.virtualAccount.id }, data }));
  }

  const fiatLinked = await findLinkedFiatTx(
    primary.userId,
    'CRYPTO_SELL',
    totalNgn,
    primary.createdAt
  );

  await prisma.$transaction([
    ...updates,
    ...txs.map((t) =>
      prisma.cryptoTransaction.update({
        where: { id: t.id },
        data: { status: CRYPTO_TX_STATUS_REVOKED as CryptoTxStatus },
      })
    ),
    ...(fiatLinked
      ? [
          prisma.fiatTransaction.update({
            where: { id: fiatLinked.id },
            data: { status: 'refunded' },
          }),
        ]
      : []),
  ]);

  const fiatReversal = await debitFiatWallet(
    primary.userId,
    totalNgn,
    `Revoked crypto sell ${primary.transactionId}`
  );

  return {
    type: 'SELL',
    legs: txs.length,
    ngnReversed: totalNgn.toString(),
    fiatReversal,
  };
}

async function revokeBuyTx(tx: Awaited<ReturnType<typeof loadCryptoTx>>) {
  const buy = tx.cryptoBuy!;
  const va = tx.virtualAccount;
  if (!va) throw ApiError.badRequest('Buy has no virtual account');

  const amountCrypto = new Decimal(buy.amount.toString());
  const amountNgn = new Decimal(buy.amountNaira.toString());
  const bucketData = debitBucketData(va, 'virtual', amountCrypto);

  const fiatLinked = await findLinkedFiatTx(tx.userId, 'CRYPTO_BUY', amountNgn, tx.createdAt);

  await prisma.$transaction([
    prisma.virtualAccount.update({ where: { id: va.id }, data: bucketData }),
    prisma.cryptoTransaction.update({
      where: { id: tx.id },
      data: { status: CRYPTO_TX_STATUS_REVOKED as CryptoTxStatus },
    }),
    ...(fiatLinked
      ? [
          prisma.fiatTransaction.update({
            where: { id: fiatLinked.id },
            data: { status: 'refunded' },
          }),
        ]
      : []),
  ]);

  const fiatReversal = await creditFiatWallet(
    tx.userId,
    amountNgn,
    `Revoked crypto buy ${tx.transactionId}`
  );

  return {
    type: 'BUY',
    cryptoReversed: amountCrypto.toString(),
    ngnReversed: amountNgn.toString(),
    fiatReversal,
  };
}

async function loadCryptoTx(transactionId: string) {
  const tx = await prisma.cryptoTransaction.findFirst({
    where: { transactionId },
    include: TX_INCLUDE,
  });
  if (!tx) throw ApiError.notFound('Crypto transaction not found');
  return tx;
}

async function collectSellBatch(tx: Awaited<ReturnType<typeof loadCryptoTx>>) {
  if (tx.sellBatchId) {
    const batch = await prisma.cryptoTransaction.findMany({
      where: { sellBatchId: tx.sellBatchId, transactionType: 'SELL' },
      include: TX_INCLUDE,
      orderBy: { id: 'asc' },
    });
    if (batch.length > 0) return batch;
  }
  return [tx];
}

/**
 * Reverse a successful crypto transaction and mark it revoked (fraud / system reversal).
 * Supports RECEIVE, SELL, and BUY. SEND/SWAP are not supported.
 */
export async function revokeCryptoTransaction(
  transactionId: string,
  input?: { adminUserId?: number; reason?: string }
) {
  const tx = await loadCryptoTx(transactionId);

  if (isRevokedOrFakeCryptoTxStatus(tx.status)) {
    return { alreadyRevoked: true, transactionId: tx.transactionId, status: tx.status };
  }
  if (tx.status !== 'successful') {
    throw ApiError.badRequest('Only successful crypto transactions can be revoked');
  }

  let result: Record<string, unknown>;

  switch (tx.transactionType) {
    case 'RECEIVE':
      if (!tx.cryptoReceive) throw ApiError.badRequest('Receive record missing');
      result = await revokeReceiveTx(tx);
      break;
    case 'SELL': {
      if (!tx.cryptoSell) throw ApiError.badRequest('Sell record missing');
      const batch = await collectSellBatch(tx);
      result = await revokeSellTxs(batch);
      break;
    }
    case 'BUY':
      if (!tx.cryptoBuy) throw ApiError.badRequest('Buy record missing');
      result = await revokeBuyTx(tx);
      break;
    default:
      throw ApiError.badRequest(
        `Cannot revoke ${tx.transactionType} transactions automatically. Use deposit tracking for outbound deposits.`
      );
  }

  tatumLogger.warn('Admin revoked crypto transaction', {
    transactionId: tx.transactionId,
    transactionType: tx.transactionType,
    userId: tx.userId,
    adminUserId: input?.adminUserId,
    reason: input?.reason,
    result,
  });

  return {
    alreadyRevoked: false,
    transactionId: tx.transactionId,
    status: CRYPTO_TX_STATUS_REVOKED,
    ...result,
  };
}
