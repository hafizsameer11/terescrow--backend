import { Decimal } from '@prisma/client/runtime/library';
import { CryptoTxStatus } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { CRYPTO_TX_STATUS_REVOKED, DEPOSIT_STATUS_FAKE_SCAM } from '../../constants/deposit.fake';
import { syncTotalBalanceFields } from '../crypto/virtual.account.balance.helper';
import tatumLogger from '../../utils/tatum.logger';

export interface FraudWalletCleanupInput {
  userEmail?: string;
  userId?: number;
  /** On-chain tx hash of the fake receive (optional but recommended). */
  receiveTxHash?: string;
  /** Force BSC / bsc virtual account balances to 0. Default true when receiveTxHash set. */
  zeroBscBalances?: boolean;
  /** Force NGN fiat wallet to 0. Default true. */
  zeroNgnWallet?: boolean;
  /** Mark successful RECEIVE/SELL crypto txs for this user on BSC as revoked. */
  revokeRelatedCryptoTxs?: boolean;
}

async function resolveUser(input: FraudWalletCleanupInput) {
  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw ApiError.notFound(`User ${input.userId} not found`);
    return user;
  }
  const email = input.userEmail?.trim().toLowerCase();
  if (!email) throw ApiError.badRequest('userEmail or userId is required');
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw ApiError.notFound(`User with email ${email} not found`);
  return user;
}

function zeroVaData() {
  return syncTotalBalanceFields(new Decimal(0), new Decimal(0));
}

/**
 * One-shot fraud remediation: mark fake receive, revoke related sells, force-zero BSC + NGN ledger.
 * Use when normal revoke fails (e.g. user already spent sell proceeds).
 */
export async function fraudWalletCleanup(input: FraudWalletCleanupInput) {
  const user = await resolveUser(input);
  const zeroBsc = input.zeroBscBalances !== false;
  const zeroNgn = input.zeroNgnWallet !== false;
  const revokeTxs = input.revokeRelatedCryptoTxs !== false;
  const receiveTxHash = input.receiveTxHash?.trim();

  const summary: Record<string, unknown> = {
    userId: user.id,
    email: user.email,
    actions: [] as string[],
  };

  if (receiveTxHash) {
    const recvTx = await prisma.cryptoTransaction.findFirst({
      where: {
        userId: user.id,
        transactionType: 'RECEIVE',
        cryptoReceive: { txHash: receiveTxHash },
      },
      include: { cryptoReceive: true },
    });

    if (recvTx?.cryptoReceive) {
      await prisma.$transaction([
        prisma.receivedAsset.updateMany({
          where: { txId: receiveTxHash },
          data: { status: DEPOSIT_STATUS_FAKE_SCAM },
        }),
        prisma.cryptoTransaction.update({
          where: { id: recvTx.id },
          data: { status: CRYPTO_TX_STATUS_REVOKED as CryptoTxStatus },
        }),
        prisma.cryptoReceive.update({
          where: { id: recvTx.cryptoReceive.id },
          data: {
            creditedAmount: new Decimal(0),
            creditedAmountUsd: new Decimal(0),
          },
        }),
      ]);
      (summary.actions as string[]).push(`Marked receive ${recvTx.transactionId} revoked + fake_scam`);
    } else {
      (summary.actions as string[]).push(`Receive tx ${receiveTxHash} not found — skipped tx mark`);
    }
  }

  if (revokeTxs) {
    const bscTxs = await prisma.cryptoTransaction.findMany({
      where: {
        userId: user.id,
        status: 'successful',
        blockchain: { in: ['bsc', 'BSC', 'Bsc'] },
        transactionType: { in: ['RECEIVE', 'SELL'] },
      },
      select: { id: true, transactionId: true, transactionType: true },
    });

    if (bscTxs.length > 0) {
      await prisma.cryptoTransaction.updateMany({
        where: { id: { in: bscTxs.map((t) => t.id) } },
        data: { status: CRYPTO_TX_STATUS_REVOKED as CryptoTxStatus },
      });
      (summary.actions as string[]).push(
        `Revoked ${bscTxs.length} successful BSC receive/sell row(s): ${bscTxs.map((t) => t.transactionId).join(', ')}`
      );
    }
  }

  if (zeroBsc) {
    const bscAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId: user.id,
        OR: [
          { blockchain: { in: ['bsc', 'BSC', 'Bsc'] } },
          { currency: { in: ['BSC', 'BNB'] } },
        ],
      },
    });

    const before = bscAccounts.map((va) => ({
      id: va.id,
      currency: va.currency,
      virtual: va.virtualBalance,
      onChain: va.onChainBalance,
      total: va.accountBalance,
    }));

    for (const va of bscAccounts) {
      await prisma.virtualAccount.update({
        where: { id: va.id },
        data: zeroVaData(),
      });
    }

    summary.bscAccountsZeroed = before;
    (summary.actions as string[]).push(`Zeroed ${bscAccounts.length} BSC virtual account(s)`);
  }

  if (zeroNgn) {
    const fiatWallet = await prisma.fiatWallet.findFirst({
      where: { userId: user.id, currency: 'NGN' },
    });

    if (fiatWallet) {
      const before = new Decimal(fiatWallet.balance);
      if (before.gt(0)) {
        await prisma.$transaction([
          prisma.fiatWallet.update({
            where: { id: fiatWallet.id },
            data: { balance: new Decimal(0) },
          }),
          prisma.fiatTransaction.create({
            data: {
              userId: user.id,
              walletId: fiatWallet.id,
              type: 'FRAUD_CLEANUP',
              status: 'completed',
              currency: 'NGN',
              amount: before,
              fees: new Decimal(0),
              totalAmount: before,
              balanceBefore: before,
              balanceAfter: new Decimal(0),
              description: 'Admin fraud cleanup — force zero NGN after revoked fake deposit',
              completedAt: new Date(),
            },
          }),
        ]);
      } else {
        await prisma.fiatWallet.update({
          where: { id: fiatWallet.id },
          data: { balance: new Decimal(0) },
        });
      }
      summary.ngnBefore = before.toString();
      summary.ngnAfter = '0';
      (summary.actions as string[]).push(`NGN wallet set to 0 (was ₦${before.toString()})`);
    }
  }

  tatumLogger.warn('Fraud wallet cleanup completed', { userId: user.id, summary });

  return summary;
}
