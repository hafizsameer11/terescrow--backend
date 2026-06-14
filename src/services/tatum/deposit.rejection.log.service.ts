import { prisma } from '../../utils/prisma';
import {
  DEPOSIT_STATUS_FAKE_SCAM,
  DEPOSIT_STATUS_PENDING_VERIFICATION,
  isFakeScamDepositStatus,
} from '../../constants/deposit.fake';
import {
  encodeFailureReason,
  getDepositRejectionInfo,
  parseRejectReference,
  type DepositRejectionStage,
} from '../../constants/deposit.rejection.reasons';
import { normalizeChainSlug } from './deposit.onchain.verifier/chain.registry';
import type { DepositCreditContext } from './deposit.credit.service';
import type { DepositVerifyResult } from './deposit.onchain.verifier/types';

function inferStageFromReason(reasonCode: string): DepositRejectionStage {
  if (
    reasonCode === 'unlisted_token_contract'
    || reasonCode === 'blocklisted_token_contract'
  ) {
    return 'scam_guard';
  }
  return 'on_chain_verify';
}

function logStatusForFake(reasonCode: string): 'rejected' | 'mismatch' {
  return reasonCode === 'unlisted_token_contract' || reasonCode === 'blocklisted_token_contract'
    ? 'rejected'
    : 'mismatch';
}

/** Ensure every fake/scam lock has a deposit_verifications audit row. */
export async function recordFakeScamDepositVerificationLog(input: {
  rejectionReasonCode: string;
  txHash: string;
  chain: string;
  userId: number;
  virtualAccountId: number;
  accountId: string;
  webhookAmount: string;
  depositAddress: string;
  contractAddress?: string | null;
  currency?: string | null;
  receivedAssetId: number;
  provider?: string;
}): Promise<number> {
  const stage = inferStageFromReason(input.rejectionReasonCode);
  const failureReason = encodeFailureReason(stage, input.rejectionReasonCode);
  const chain = normalizeChainSlug(input.chain) || input.chain.toLowerCase();
  const row = await prisma.depositVerification.upsert({
    where: { txHash_chain: { txHash: input.txHash, chain } },
    create: {
      txHash: input.txHash,
      chain,
      userId: input.userId,
      virtualAccountId: input.virtualAccountId,
      accountId: input.accountId,
      status: logStatusForFake(input.rejectionReasonCode),
      attempts: 1,
      webhookAmount: input.webhookAmount,
      contractAddress: input.contractAddress ?? null,
      depositAddress: input.depositAddress,
      provider: input.provider ?? (stage === 'scam_guard' ? 'scam_guard' : 'on_chain_verify'),
      failureReason,
      receivedAssetId: input.receivedAssetId,
      payload: {
        currency: input.currency,
        rejection: getDepositRejectionInfo(failureReason, input.rejectionReasonCode),
      } as object,
    },
    update: {
      status: logStatusForFake(input.rejectionReasonCode),
      failureReason,
      provider: input.provider ?? (stage === 'scam_guard' ? 'scam_guard' : 'on_chain_verify'),
      receivedAssetId: input.receivedAssetId,
      webhookAmount: input.webhookAmount,
      depositAddress: input.depositAddress,
      contractAddress: input.contractAddress ?? undefined,
      payload: {
        currency: input.currency,
        rejection: getDepositRejectionInfo(failureReason, input.rejectionReasonCode),
      } as object,
    },
  });
  return row.id;
}

/**
 * Materialize logs for fake/pending deposits that pre-date verification logging.
 * Safe to run on every list — skips rows that already exist for tx+chain.
 */
export async function backfillDepositVerificationLogsFromDeposits(): Promise<number> {
  const assets = await prisma.receivedAsset.findMany({
    where: {
      status: { in: [DEPOSIT_STATUS_FAKE_SCAM, DEPOSIT_STATUS_PENDING_VERIFICATION] },
      txId: { not: null },
      userId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    take: 300,
  });

  let created = 0;

  for (const asset of assets) {
    const txHash = asset.txId?.trim();
    const userId = asset.userId;
    if (!txHash || userId == null) continue;

    const receiveTx = await prisma.cryptoTransaction.findFirst({
      where: {
        transactionType: 'RECEIVE',
        cryptoReceive: { txHash },
      },
      select: {
        virtualAccountId: true,
        blockchain: true,
        currency: true,
        status: true,
      },
    });

    let virtualAccountId = receiveTx?.virtualAccountId ?? null;
    let chainSource = receiveTx?.blockchain;
    if (!virtualAccountId) {
      const va = await prisma.virtualAccount.findFirst({
        where: { userId },
        orderBy: { id: 'desc' },
        select: { id: true, blockchain: true },
      });
      virtualAccountId = va?.id ?? null;
      chainSource = chainSource ?? va?.blockchain;
    }
    if (!virtualAccountId) continue;

    const chain = normalizeChainSlug(chainSource ?? 'unknown');
    const existing = await prisma.depositVerification.findUnique({
      where: { txHash_chain: { txHash, chain } },
    });
    if (existing) continue;

    const parsedReason = parseRejectReference(asset.reference ?? '');
    const isFake = isFakeScamDepositStatus(asset.status);
    let reasonCode: string;
    if (parsedReason) {
      reasonCode = parsedReason;
    } else if (isFake) {
      reasonCode = 'unlisted_token_contract';
    } else if (receiveTx?.status === 'verify_failed_timeout') {
      reasonCode = 'verify_failed_timeout';
    } else {
      reasonCode = 'transfer_not_found_on_chain';
    }

    const stage = isFake ? inferStageFromReason(reasonCode) : 'on_chain_verify';
    const status = isFake
      ? logStatusForFake(reasonCode)
      : receiveTx?.status === 'verify_failed_timeout'
        ? 'failed'
        : 'pending';

    const contractFromRef = asset.reference?.startsWith('fake:')
      ? asset.reference.slice(5)
      : null;

    await prisma.depositVerification.create({
      data: {
        txHash,
        chain,
        userId,
        virtualAccountId,
        accountId: asset.accountId,
        status,
        attempts: 1,
        webhookAmount: asset.amount?.toString() ?? null,
        depositAddress: asset.toAddress,
        contractAddress: contractFromRef,
        provider: stage === 'scam_guard' ? 'scam_guard' : 'backfill',
        failureReason: encodeFailureReason(stage, reasonCode),
        receivedAssetId: asset.id,
        payload: {
          currency: asset.currency ?? receiveTx?.currency,
          blockchain: chainSource ?? chain,
          txId: txHash,
          amount: asset.amount?.toString() ?? null,
          to: asset.toAddress,
          from: asset.fromAddress,
          subscriptionType: asset.subscriptionType,
          backfilled: true,
          rejection: getDepositRejectionInfo(encodeFailureReason(stage, reasonCode), reasonCode),
        } as object,
      },
    });
    created += 1;
  }

  // Orphan fake RECEIVE rows (crypto tx flagged fake without a received_asset log row yet).
  const fakeReceives = await prisma.cryptoTransaction.findMany({
    where: { transactionType: 'RECEIVE', status: 'fake' },
    include: { cryptoReceive: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  for (const tx of fakeReceives) {
    const txHash = tx.cryptoReceive?.txHash?.trim();
    if (!txHash || tx.virtualAccountId == null) continue;
    const chain = normalizeChainSlug(tx.blockchain);
    const existing = await prisma.depositVerification.findUnique({
      where: { txHash_chain: { txHash, chain } },
    });
    if (existing) continue;

    const asset = await prisma.receivedAsset.findFirst({ where: { txId: txHash } });
    const parsedReason = parseRejectReference(asset?.reference ?? '');
    const reasonCode = parsedReason ?? 'unlisted_token_contract';
    const stage = inferStageFromReason(reasonCode);

    await prisma.depositVerification.create({
      data: {
        txHash,
        chain,
        userId: tx.userId,
        virtualAccountId: tx.virtualAccountId,
        accountId: asset?.accountId ?? null,
        status: logStatusForFake(reasonCode),
        attempts: 1,
        webhookAmount: tx.cryptoReceive?.amount?.toString() ?? asset?.amount?.toString() ?? null,
        depositAddress: tx.cryptoReceive?.toAddress ?? asset?.toAddress ?? null,
        contractAddress: asset?.reference?.startsWith('fake:') ? asset.reference.slice(5) : null,
        provider: 'backfill',
        failureReason: encodeFailureReason(stage, reasonCode),
        receivedAssetId: asset?.id ?? null,
        payload: {
          currency: tx.currency,
          backfilled: true,
          rejection: getDepositRejectionInfo(encodeFailureReason(stage, reasonCode), reasonCode),
        } as object,
      },
    });
    created += 1;
  }

  return created;
}

export async function recordScamGuardRejection(input: {
  stage?: DepositRejectionStage;
  reasonCode: string;
  txHash: string;
  chain: string;
  userId: number;
  virtualAccountId: number;
  accountId: string;
  webhookAmount: string;
  depositAddress: string;
  contractAddress?: string | null;
  currency?: string | null;
  receivedAssetId?: number | null;
  webhookSnapshot?: unknown;
}): Promise<number> {
  const failureReason = encodeFailureReason(input.stage ?? 'scam_guard', input.reasonCode);
  const row = await prisma.depositVerification.upsert({
    where: { txHash_chain: { txHash: input.txHash, chain: input.chain.toLowerCase() } },
    create: {
      txHash: input.txHash,
      chain: input.chain.toLowerCase(),
      userId: input.userId,
      virtualAccountId: input.virtualAccountId,
      accountId: input.accountId,
      status: 'rejected',
      attempts: 1,
      webhookAmount: input.webhookAmount,
      contractAddress: input.contractAddress ?? null,
      depositAddress: input.depositAddress,
      provider: 'scam_guard',
      failureReason,
      rawSnippet: input.webhookSnapshot as object | undefined,
      receivedAssetId: input.receivedAssetId ?? null,
      payload: {
        currency: input.currency,
        rejection: getDepositRejectionInfo(failureReason),
      } as object,
    },
    update: {
      status: 'rejected',
      failureReason,
      provider: 'scam_guard',
      receivedAssetId: input.receivedAssetId ?? undefined,
      rawSnippet: input.webhookSnapshot as object | undefined,
      payload: {
        currency: input.currency,
        rejection: getDepositRejectionInfo(failureReason),
      } as object,
    },
  });
  return row.id;
}

export async function recordVerifyRejection(input: {
  ctx: DepositCreditContext;
  verifyResult: DepositVerifyResult;
  status: 'mismatch' | 'failed' | 'rejected';
  receivedAssetId?: number | null;
}): Promise<number> {
  const chain = input.ctx.blockchain.toLowerCase();
  const failureReason = encodeFailureReason('on_chain_verify', input.verifyResult.reason ?? input.status);
  const row = await prisma.depositVerification.upsert({
    where: { txHash_chain: { txHash: input.ctx.txId, chain } },
    create: {
      txHash: input.ctx.txId,
      chain,
      userId: input.ctx.userId,
      virtualAccountId: input.ctx.virtualAccountId,
      accountId: input.ctx.accountId,
      status: input.status,
      attempts: 1,
      webhookAmount: input.ctx.amount,
      onChainAmount: input.verifyResult.onChainAmount ?? null,
      contractAddress: input.ctx.contractAddress ?? null,
      depositAddress: input.ctx.to,
      provider: input.verifyResult.provider ?? null,
      failureReason,
      rawSnippet: input.verifyResult.rawSnippet as object | undefined,
      receivedAssetId: input.receivedAssetId ?? null,
      payload: {
        ...input.ctx,
        rejection: getDepositRejectionInfo(failureReason, input.verifyResult.reason),
      } as object,
    },
    update: {
      status: input.status,
      failureReason,
      onChainAmount: input.verifyResult.onChainAmount ?? undefined,
      provider: input.verifyResult.provider ?? undefined,
      rawSnippet: input.verifyResult.rawSnippet as object | undefined,
      receivedAssetId: input.receivedAssetId ?? undefined,
      payload: {
        ...input.ctx,
        rejection: getDepositRejectionInfo(failureReason, input.verifyResult.reason),
      } as object,
    },
  });
  return row.id;
}
