import { prisma } from '../../utils/prisma';
import {
  encodeFailureReason,
  getDepositRejectionInfo,
  type DepositRejectionStage,
} from '../../constants/deposit.rejection.reasons';
import type { DepositCreditContext } from './deposit.credit.service';
import type { DepositVerifyResult } from './deposit.onchain.verifier/types';

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
