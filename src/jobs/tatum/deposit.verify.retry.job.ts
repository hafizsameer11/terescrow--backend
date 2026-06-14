import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import tatumLogger from '../../utils/tatum.logger';
import { verifyDepositOnChain } from '../../services/tatum/deposit.onchain.verifier';
import {
  finalizeDepositCredit,
  type DepositCreditContext,
} from '../../services/tatum/deposit.credit.service';
import {
  enqueueDepositVerifyRetry,
  markDepositVerified,
  markDepositVerifyFailed,
} from '../../services/tatum/deposit.pending.service';
import { lockFakeScamDeposit } from '../../services/tatum/deposit.fraud.lock.service';
import { getMaxVerifyAttempts } from '../../services/tatum/deposit.onchain.verifier/chain.registry';
import { isDefinitiveFraudRejection } from '../../constants/deposit.rejection.reasons';
import { recordVerifyRejection } from '../../services/tatum/deposit.rejection.log.service';
import type { WalletCurrency } from '@prisma/client';
import { blockchainDbVariants } from '../../services/tatum/deposit.token.resolver';

export interface RetryDepositVerificationJobData {
  depositVerificationId: number;
  attemptNumber: number;
}

export async function processRetryDepositVerificationJob(
  job: Job<RetryDepositVerificationJobData>
): Promise<void> {
  const { depositVerificationId } = job.data;
  const attempt = job.attemptsMade + 1;

  const row = await prisma.depositVerification.findUnique({
    where: { id: depositVerificationId },
  });
  if (!row || row.status === 'verified' || row.status === 'mismatch') {
    return;
  }

  const ctx = row.payload as DepositCreditContext | null;
  if (!ctx) {
    await markDepositVerifyFailed(depositVerificationId, 'missing_payload');
    return;
  }

  let walletCurrency: WalletCurrency | null = null;
  if (ctx.contractAddress) {
    walletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        contractAddress: { not: null },
        blockchain: { in: blockchainDbVariants(ctx.blockchain) },
      },
    });
  }

  const verifyResult = await verifyDepositOnChain({
    chainSlug: ctx.blockchain.toLowerCase(),
    txHash: ctx.txId,
    depositAddress: ctx.to,
    expectedAmount: ctx.amount,
    contractAddress: ctx.contractAddress,
    isToken: Boolean(ctx.isToken),
    walletCurrency,
    subscriptionType: ctx.subscriptionType,
    blockNumber: ctx.blockHeight ?? null,
  });

  await prisma.depositVerification.update({
    where: { id: depositVerificationId },
    data: {
      attempts: attempt,
      provider: verifyResult.provider ?? row.provider,
      onChainAmount: verifyResult.onChainAmount ?? row.onChainAmount,
      failureReason: verifyResult.reason ?? null,
      rawSnippet: verifyResult.rawSnippet as object | undefined,
    },
  });

  if (verifyResult.status === 'verified') {
    await finalizeDepositCredit(ctx, { upgradeFromPending: true });
    await markDepositVerified(depositVerificationId);
    tatumLogger.info('Deposit verified on retry — credited', { txHash: ctx.txId, attempt });
    return;
  }

  if (verifyResult.status === 'mismatch') {
    if (isDefinitiveFraudRejection(verifyResult.reason)) {
      await recordVerifyRejection({
        ctx,
        verifyResult,
        status: 'mismatch',
        receivedAssetId: row.receivedAssetId,
      });
      await lockFakeScamDeposit({
        userId: ctx.userId,
        virtualAccountId: ctx.virtualAccountId,
        accountId: ctx.accountId,
        txId: ctx.txId,
        fromAddress: ctx.from,
        toAddress: ctx.to,
        grossAmount: ctx.amount,
        contractAddress: verifyResult.onChainContract ?? ctx.contractAddress ?? 'unknown',
        blockchain: ctx.blockchain,
        subscriptionType: ctx.subscriptionType,
        transactionDate: new Date(ctx.transactionDate),
        index: ctx.index ?? null,
        rejectionReasonCode: verifyResult.reason ?? 'contract_mismatch',
      });
      return;
    }

    if (attempt >= getMaxVerifyAttempts()) {
      await recordVerifyRejection({
        ctx,
        verifyResult,
        status: 'failed',
        receivedAssetId: row.receivedAssetId,
      });
      await markDepositVerifyFailed(depositVerificationId, verifyResult.reason ?? 'verify_mismatch_timeout');
      return;
    }

    await enqueueDepositVerifyRetry(depositVerificationId, attempt + 1);
    tatumLogger.info('Non-fraud verify mismatch — retrying', {
      txHash: ctx.txId,
      attempt,
      reason: verifyResult.reason,
    });
    return;
  }

  if (attempt >= getMaxVerifyAttempts()) {
    await markDepositVerifyFailed(depositVerificationId, verifyResult.reason ?? 'max_attempts');
    return;
  }

  await enqueueDepositVerifyRetry(depositVerificationId, attempt + 1);
  tatumLogger.info('Deposit verify still pending — rescheduled', {
    txHash: ctx.txId,
    attempt,
    reason: verifyResult.reason,
  });
}
