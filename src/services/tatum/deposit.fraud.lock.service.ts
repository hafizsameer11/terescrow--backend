import { Decimal } from '@prisma/client/runtime/library';
import { InAppNotificationType, type WalletCurrency } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  isFakeScamDepositStatus,
  isRevokedOrFakeCryptoTxStatus,
} from '../../constants/deposit.fake';
import { evaluateIncomingDeposit } from './deposit.scam.guard';
import { resolveWalletCurrencyFromContract } from './deposit.token.resolver';

export {
  evaluateIncomingDeposit,
  isFungibleTokenWebhook,
  isTokenContractIdentifier,
  looksLikeEvmContract,
} from './deposit.scam.guard';
import { shouldBanUserForRejection } from '../../constants/deposit.rejection.reasons';
import { recordFakeScamDepositVerificationLog } from './deposit.rejection.log.service';
import { processFakeScamDeposit } from './fake.deposit.service';
import { getOnChainBalance, type VirtualAccountBalanceFields } from '../crypto/virtual.account.balance.helper';
import tatumLogger from '../../utils/tatum.logger';
import { isUserBanned, FEATURE_CRYPTO, FEATURE_DEPOSIT, FEATURE_WITHDRAWAL, FEATURE_GIFT_CARD } from '../../utils/customer.restrictions';
import { sendSystemEmail } from '../../utils/systemEmail';

const FRAUD_BAN_REASON =
  'Automatic ban: unlisted/scam token deposit detected. No funds were credited. Contact support if you believe this is an error.';

const ALL_FREEZE_FEATURES = [FEATURE_DEPOSIT, FEATURE_WITHDRAWAL, FEATURE_CRYPTO, FEATURE_GIFT_CARD];

export interface IncomingFungibleDepositInput {
  userId: number;
  virtualAccountId: number;
  accountId: string;
  txId: string;
  fromAddress: string;
  toAddress: string;
  grossAmount: string;
  contractAddress: string;
  blockchain: string;
  subscriptionType?: string;
  transactionDate: Date;
  index?: number | null;
}

/**
 * Whitelist check: returns wallet currency if contract is allowed, else null (scam / unlisted).
 */
export async function resolveAllowedDepositCurrency(chainSlug: string, contractAddress: string) {
  return resolveWalletCurrencyFromContract(chainSlug, contractAddress);
}

/**
 * Central gate: reject fake/scam tokens (record + ban) or banned-user credits before balance update.
 */
export async function rejectScamDepositIfNeeded(input: {
  userStatus?: string | null;
  chainSlug: string;
  subscriptionType?: string;
  contractAddress?: string | null;
  assetField?: string | null;
  webhookType?: string;
  lockPayload: IncomingFungibleDepositInput;
}): Promise<
  | { rejected: true; reason: string }
  | { rejected: false; walletCurrency: WalletCurrency | null; isToken: boolean }
> {
  const verdict = await evaluateIncomingDeposit({
    userStatus: input.userStatus,
    chainSlug: input.chainSlug,
    subscriptionType: input.subscriptionType,
    contractAddress: input.contractAddress,
    assetField: input.assetField,
    webhookType: input.webhookType,
  });

  if (verdict.action === 'reject_fake') {
    await lockFakeScamDeposit({
      ...input.lockPayload,
      contractAddress: verdict.contractAddress,
      rejectionReasonCode: verdict.reason,
    });
    return { rejected: true, reason: verdict.reason };
  }

  if (verdict.action === 'reject_banned') {
    tatumLogger.warn('Deposit credit blocked — user banned', {
      userId: input.lockPayload.userId,
      txId: input.lockPayload.txId,
      chain: input.chainSlug,
    });
    return { rejected: true, reason: verdict.reason };
  }

  return {
    rejected: false,
    walletCurrency: verdict.walletCurrency,
    isToken: verdict.isToken,
  };
}

/**
 * Record a locked fake deposit — no credit, no customer notification, admin alert.
 */
export async function lockFakeScamDeposit(
  input: IncomingFungibleDepositInput & { rejectionReasonCode?: string; skipBan?: boolean }
) {
  const rejectionReasonCode = input.rejectionReasonCode ?? 'unlisted_token_contract';
  const result = await processFakeScamDeposit({
    userId: input.userId,
    virtualAccountId: input.virtualAccountId,
    accountId: input.accountId,
    txId: input.txId,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    grossAmount: input.grossAmount,
    contractAddress: input.contractAddress,
    currencyLabel: 'FAKE_TOKEN',
    blockchain: input.blockchain,
    subscriptionType: input.subscriptionType,
    transactionDate: input.transactionDate,
    index: input.index,
    reference: undefined,
    rejectionReasonCode,
  });

  if (result.receivedAsset?.id) {
    await recordFakeScamDepositVerificationLog({
      rejectionReasonCode,
      txHash: input.txId,
      chain: input.blockchain,
      userId: input.userId,
      virtualAccountId: input.virtualAccountId,
      accountId: input.accountId,
      webhookAmount: input.grossAmount,
      depositAddress: input.toAddress,
      contractAddress: input.contractAddress || null,
      receivedAssetId: result.receivedAsset.id,
    });
  }

  if (!input.skipBan && shouldBanUserForRejection(rejectionReasonCode)) {
    await banUserForFraudDeposit({
      userId: input.userId,
      txId: input.txId,
      contractAddress: input.contractAddress,
      amount: input.grossAmount,
      blockchain: input.blockchain,
      rejectionReasonCode,
    });
  }

  tatumLogger.warn('Deposit locked as fake_scam — no credit', {
    txId: input.txId,
    contractAddress: input.contractAddress,
    userId: input.userId,
    rejectionReasonCode,
    banned: !input.skipBan && shouldBanUserForRejection(rejectionReasonCode),
  });

  return result;
}

/** Ban customer, freeze all features, notify admin + user (in-app + email). */
async function banUserForFraudDeposit(input: {
  userId: number;
  txId: string;
  contractAddress: string;
  amount: string;
  blockchain: string;
  rejectionReasonCode?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      username: true,
      firstname: true,
      lastname: true,
      status: true,
    },
  });
  if (!user) return;

  const label = user.username || user.email || `user #${input.userId}`;
  const wasAlreadyBanned = isUserBanned(user.status);

  if (!wasAlreadyBanned) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { status: 'banned' },
    });

    for (const feature of ALL_FREEZE_FEATURES) {
      await prisma.userFeatureFreeze.upsert({
        where: { userId_feature: { userId: input.userId, feature } },
        create: { userId: input.userId, feature },
        update: {},
      });
    }

    await prisma.accountActivity.create({
      data: {
        userId: input.userId,
        description: `${FRAUD_BAN_REASON} Tx: ${input.txId}. Contract: ${input.contractAddress}.`,
      },
    });
  }

  const fraudSummary =
    `Deposit blocked (no credit). Reason: ${input.rejectionReasonCode ?? 'scam'}. User: ${label} (${user.email}). ` +
    `Chain: ${input.blockchain}. Amount: ${input.amount}. Contract: ${input.contractAddress}. Tx: ${input.txId}`;

  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true, email: true },
    take: 50,
  });

  if (admins.length > 0) {
    await prisma.inAppNotification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: wasAlreadyBanned ? 'Fake deposit blocked (user already banned)' : 'Fake deposit — user auto-banned',
        description: fraudSummary,
        type: InAppNotificationType.team,
      })),
    });
  }

  const userBanHtml = `
    <p>Hi <strong>${user.firstname || user.username || 'there'}</strong>,</p>
    <p>Your Tercescrow account has been <strong>restricted</strong> because our system detected a
    <strong>fake or unlisted token deposit</strong> to your wallet address.</p>
    <p>This type of transaction is not supported and <strong>no funds were credited</strong> to your account.</p>
    <p><strong>What this means:</strong> You cannot send, receive, swap, buy, sell, deposit, or withdraw until this is reviewed.</p>
    <p>If you believe this is a mistake, please contact our support team with your account email.</p>
    <p>Reference: ${input.txId}</p>
    <br/>
    <p>Tercescrow Security</p>
  `;

  const adminAlertHtml = `
    <p><strong>Fraud deposit auto-ban</strong></p>
    <p>${fraudSummary}</p>
    <p>User status: ${wasAlreadyBanned ? 'already banned' : 'banned now'}. All features frozen.</p>
  `;

  await Promise.all([
    sendSystemEmail(
      user.email,
      'Tercescrow — Account restricted (suspicious deposit)',
      userBanHtml
    ),
    ...admins
      .filter((a) => a.email)
      .map((a) =>
        sendSystemEmail(
          a.email,
          `[Tercescrow Admin] Fake deposit — ${label}`,
          adminAlertHtml
        )
      ),
    prisma.inAppNotification.create({
      data: {
        userId: input.userId,
        title: 'Account restricted',
        description:
          'Your account was restricted after a fake/unlisted token deposit was detected. No funds were credited. Contact support.',
        type: InAppNotificationType.customeer,
      },
    }),
  ]);
}

/** Throws if deposit / crypto tx is fraud-locked (no send, sell, sweep, disburse). */
export function assertDepositNotLocked(input: {
  cryptoTxStatus?: string | null;
  receivedAssetStatus?: string | null;
  action?: string;
}): void {
  const action = input.action || 'move funds from this deposit';
  if (isRevokedOrFakeCryptoTxStatus(input.cryptoTxStatus)) {
    throw ApiError.conflict(`This deposit is revoked/fraud-locked — cannot ${action}`);
  }
  if (isFakeScamDepositStatus(input.receivedAssetStatus)) {
    throw ApiError.conflict(`This deposit is a fake/scam token — cannot ${action}`);
  }
}

/** Sum on-chain credits from legitimate (non-fraud) receives for a virtual account. */
export async function computeLegitimateOnChainCredited(
  userId: number,
  virtualAccountId: number
): Promise<Decimal> {
  const receives = await prisma.cryptoTransaction.findMany({
    where: {
      userId,
      virtualAccountId,
      transactionType: 'RECEIVE',
      OR: [{ balanceBucket: 'on_chain' }, { balanceBucket: null }],
    },
    include: { cryptoReceive: true },
  });

  let total = new Decimal(0);
  for (const tx of receives) {
    if (isRevokedOrFakeCryptoTxStatus(tx.status)) continue;
    const hash = tx.cryptoReceive?.txHash;
    if (!hash) continue;
    const ra = await prisma.receivedAsset.findFirst({ where: { txId: hash } });
    if (isFakeScamDepositStatus(ra?.status)) continue;
    const recv = tx.cryptoReceive!;
    const credited = new Decimal(recv.creditedAmount?.toString() ?? recv.amount.toString());
    total = total.plus(credited);
  }
  return total;
}

/** Sum successful on-chain sells for a virtual account. */
export async function computeOnChainSold(
  userId: number,
  virtualAccountId: number
): Promise<Decimal> {
  const sells = await prisma.cryptoTransaction.findMany({
    where: {
      userId,
      virtualAccountId,
      transactionType: 'SELL',
      balanceBucket: 'on_chain',
      status: 'successful',
    },
    include: { cryptoSell: true },
  });
  let total = new Decimal(0);
  for (const tx of sells) {
    if (!tx.cryptoSell) continue;
    total = total.plus(new Decimal(tx.cryptoSell.amount.toString()));
  }
  return total;
}

/**
 * Block sell/send when ledger on-chain balance exceeds verified legitimate deposits.
 * Prevents spending miscredited scam-token balances.
 */
export async function assertOnChainSpendIntegrity(
  userId: number,
  virtualAccountId: number,
  va: VirtualAccountBalanceFields
): Promise<void> {
  const onChain = getOnChainBalance(va);
  if (onChain.lte(0)) return;

  const [credited, sold] = await Promise.all([
    computeLegitimateOnChainCredited(userId, virtualAccountId),
    computeOnChainSold(userId, virtualAccountId),
  ]);

  const maxSpendable = Decimal.max(credited.minus(sold), new Decimal(0));
  const tolerance = new Decimal('0.000001');

  if (onChain.gt(maxSpendable.plus(tolerance))) {
    tatumLogger.warn('On-chain spend blocked — balance exceeds legitimate deposits', {
      userId,
      virtualAccountId,
      onChain: onChain.toString(),
      maxSpendable: maxSpendable.toString(),
      credited: credited.toString(),
      sold: sold.toString(),
    });
    throw ApiError.conflict(
      'On-chain balance includes locked or unverified funds (possible scam deposit). Contact support.'
    );
  }
}

/** Admin list of fraud-locked deposits. */
export async function listLockedDeposits(params: { page?: number; limit?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = { status: 'fake_scam' as const };

  const [rows, total] = await Promise.all([
    prisma.receivedAsset.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true, username: true, firstname: true, lastname: true } },
      },
    }),
    prisma.receivedAsset.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      txId: r.txId,
      userId: r.userId,
      user: r.user,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      reference: r.reference,
      fromAddress: r.fromAddress,
      toAddress: r.toAddress,
      transactionDate: r.transactionDate,
      locked: true,
      lockReason: 'unlisted_token_contract',
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
