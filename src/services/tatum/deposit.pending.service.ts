import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import tatumLogger from '../../utils/tatum.logger';
import { sendPushNotification } from '../../utils/pushService';
import {
  CRYPTO_TX_STATUS_PENDING_VERIFY,
  CRYPTO_TX_STATUS_VERIFY_FAILED,
  DEPOSIT_STATUS_PENDING_VERIFICATION,
} from '../../constants/deposit.fake';
import {
  getMaxVerifyAttempts,
  getVerifyRetryDelayMs,
} from './deposit.onchain.verifier/chain.registry';
import type { DepositCreditContext } from './deposit.credit.service';
import type { DepositVerifyResult } from './deposit.onchain.verifier/types';
import cryptoTransactionService from '../crypto/crypto.transaction.service';
import { Decimal } from '@prisma/client/runtime/library';

export async function enqueueDepositVerifyRetry(depositVerificationId: number, attemptNumber: number): Promise<void> {
  const { queueManager } = await import('../../queue/queue.manager');
  const delay = getVerifyRetryDelayMs();
  await queueManager.addJob(
    'default',
    'retry-deposit-verification',
    { depositVerificationId, attemptNumber },
    {
      delay,
      attempts: getMaxVerifyAttempts(),
      backoff: { type: 'exponential', delay },
      jobId: `deposit-verify-${depositVerificationId}-${attemptNumber}`,
    }
  );
}

export async function createPendingVerificationDeposit(
  ctx: DepositCreditContext,
  verifyResult: DepositVerifyResult
): Promise<{ depositVerificationId: number; receivedAssetId: number }> {
  const chain = ctx.blockchain.toLowerCase();

  const existing = await prisma.depositVerification.findUnique({
    where: { txHash_chain: { txHash: ctx.txId, chain } },
  });
  if (existing?.status === 'verified') {
    throw new Error('Deposit already verified');
  }

  const receivedAsset = await prisma.receivedAsset.create({
    data: {
      accountId: ctx.accountId,
      subscriptionType: ctx.subscriptionType,
      amount: parseFloat(ctx.amount),
      reference: ctx.reference,
      currency: ctx.currency,
      txId: ctx.txId,
      fromAddress: ctx.from,
      toAddress: ctx.to,
      transactionDate: ctx.transactionDate,
      status: DEPOSIT_STATUS_PENDING_VERIFICATION,
      index: ctx.index ?? null,
      userId: ctx.userId,
    },
  });

  await prisma.receiveTransaction.create({
    data: {
      userId: ctx.userId,
      virtualAccountId: ctx.virtualAccountId,
      transactionType: 'on_chain',
      senderAddress: ctx.from,
      reference: ctx.reference,
      txId: ctx.txId,
      amount: parseFloat(ctx.amount),
      currency: ctx.currency,
      blockchain: ctx.blockchain,
      status: CRYPTO_TX_STATUS_PENDING_VERIFY,
    },
  });

  const grossAmount = new Decimal(ctx.amount);
  const transactionId = `RECEIVE-PENDING-${Date.now()}-${ctx.userId}`;
  await cryptoTransactionService.createReceiveTransaction({
    userId: ctx.userId,
    virtualAccountId: ctx.virtualAccountId,
    transactionId,
    balanceBucket: 'on_chain',
    fromAddress: ctx.from,
    toAddress: ctx.to,
    amount: grossAmount.toString(),
    amountUsd: '0',
    amountNaira: '0',
    rate: '0',
    grossAmount: grossAmount.toString(),
    creditedAmount: '0',
    grossAmountUsd: '0',
    creditedAmountUsd: '0',
    txHash: ctx.txId,
    blockNumber: ctx.blockHeight ? BigInt(ctx.blockHeight) : undefined,
    confirmations: 0,
    status: CRYPTO_TX_STATUS_PENDING_VERIFY,
  });

  const depositVerification = await prisma.depositVerification.upsert({
    where: { txHash_chain: { txHash: ctx.txId, chain } },
    create: {
      txHash: ctx.txId,
      chain,
      userId: ctx.userId,
      virtualAccountId: ctx.virtualAccountId,
      accountId: ctx.accountId,
      status: 'pending',
      attempts: 1,
      nextRetryAt: new Date(Date.now() + getVerifyRetryDelayMs()),
      webhookAmount: ctx.amount,
      onChainAmount: verifyResult.onChainAmount ?? null,
      contractAddress: ctx.contractAddress ?? null,
      depositAddress: ctx.to,
      provider: verifyResult.provider ?? null,
      failureReason: verifyResult.reason ?? null,
      rawSnippet: verifyResult.rawSnippet as object | undefined,
      receivedAssetId: receivedAsset.id,
      payload: ctx as object,
    },
    update: {
      attempts: { increment: 1 },
      nextRetryAt: new Date(Date.now() + getVerifyRetryDelayMs()),
      failureReason: verifyResult.reason ?? null,
      provider: verifyResult.provider ?? null,
      receivedAssetId: receivedAsset.id,
      payload: ctx as object,
    },
  });

  await enqueueDepositVerifyRetry(depositVerification.id, depositVerification.attempts);

  const pendingBody = `Your ${ctx.currency.toUpperCase()} deposit is pending on-chain confirmation. We will credit your balance once verified.`;
  try {
    await sendPushNotification({
      userId: ctx.userId,
      title: 'Deposit Pending Confirmation',
      body: pendingBody,
      sound: 'default',
      priority: 'high',
      data: {
        type: 'crypto_receive_pending',
        txHash: ctx.txId,
        currency: ctx.currency.toUpperCase(),
      },
    });
    await prisma.inAppNotification.create({
      data: {
        userId: ctx.userId,
        title: 'Deposit Pending Confirmation',
        description: pendingBody,
        type: InAppNotificationType.customeer,
      },
    });
  } catch (err: unknown) {
    tatumLogger.exception('Pending deposit notification', err as Error, { userId: ctx.userId });
  }

  tatumLogger.info('Deposit held for on-chain verification', {
    txId: ctx.txId,
    depositVerificationId: depositVerification.id,
    reason: verifyResult.reason,
  });

  return { depositVerificationId: depositVerification.id, receivedAssetId: receivedAsset.id };
}

export async function markDepositVerifyFailed(depositVerificationId: number, reason: string): Promise<void> {
  const row = await prisma.depositVerification.update({
    where: { id: depositVerificationId },
    data: { status: 'failed', failureReason: reason },
  });

  if (row.receivedAssetId) {
    await prisma.receivedAsset.update({
      where: { id: row.receivedAssetId },
      data: { status: DEPOSIT_STATUS_PENDING_VERIFICATION },
    });
  }

  await prisma.cryptoTransaction.updateMany({
    where: {
      transactionType: 'RECEIVE',
      cryptoReceive: { txHash: row.txHash },
      status: CRYPTO_TX_STATUS_PENDING_VERIFY,
    },
    data: { status: CRYPTO_TX_STATUS_VERIFY_FAILED },
  });

  tatumLogger.warn('Deposit verification failed after max attempts', {
    depositVerificationId,
    txHash: row.txHash,
    reason,
  });
}

export async function markDepositVerified(depositVerificationId: number): Promise<void> {
  await prisma.depositVerification.update({
    where: { id: depositVerificationId },
    data: { status: 'verified', failureReason: null },
  });
}
