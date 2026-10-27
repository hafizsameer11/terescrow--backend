/**
 * PalmPay payout (withdraw) webhook outcomes.
 * Initial initiate may mark success + debit; on failure webhook we refund once.
 */
import { InAppNotificationType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import { sendPushNotification } from '../../utils/pushService';
import palmpayLogger from '../../utils/palmpay.logger';

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Handle payout webhook. Returns true if this was a payout order we recognized.
 */
export async function handlePalmPayPayoutWebhook(payload: {
  orderId?: string;
  orderNo?: string;
  orderStatus?: number;
  errorMsg?: string;
  errorCode?: string;
  sessionId?: string;
}): Promise<boolean> {
  const orderId = String(payload.orderId || '').trim();
  const orderNo = String(payload.orderNo || '').trim();
  const orderStatus = Number(payload.orderStatus);

  if (!orderId && !orderNo) return false;

  const transaction = await prisma.fiatTransaction.findFirst({
    where: {
      type: 'WITHDRAW',
      OR: [
        ...(orderId ? [{ palmpayOrderId: orderId }] : []),
        ...(orderNo ? [{ palmpayOrderNo: orderNo }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!transaction) {
    if (orderId.startsWith('payout_')) {
      palmpayLogger.warn('PalmPay payout webhook: WITHDRAW txn not found', {
        orderId,
        orderNo,
        orderStatus,
      });
      return true; // payout-shaped id, nothing to refund
    }
    return false;
  }

  // Success — keep completed (initiate already debited / marked success)
  if (orderStatus === 2) {
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayStatus: '2',
        ...(payload.sessionId ? { palmpaySessionId: String(payload.sessionId) } : {}),
        ...(transaction.status !== 'completed'
          ? { status: 'completed', completedAt: transaction.completedAt || new Date() }
          : {}),
        ...(orderNo && !transaction.palmpayOrderNo ? { palmpayOrderNo: orderNo } : {}),
      },
    });
    palmpayLogger.info('PalmPay payout webhook: success confirmed', {
      transactionId: transaction.id,
      orderId,
      orderNo,
    });
    return true;
  }

  // Failed / cancelled → refund once, mark failed, notify
  if (orderStatus === 3 || orderStatus === 4) {
    await refundFailedPayoutTransaction(transaction.id, {
      orderStatus,
      errorMsg: payload.errorMsg,
      errorCode: payload.errorCode,
      sessionId: payload.sessionId,
      orderNo,
    });
    return true;
  }

  // Pending (1) — just store provider status
  if (orderStatus === 1) {
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayStatus: '1',
        ...(payload.sessionId ? { palmpaySessionId: String(payload.sessionId) } : {}),
        ...(orderNo && !transaction.palmpayOrderNo ? { palmpayOrderNo: orderNo } : {}),
      },
    });
    return true;
  }

  return true;
}

export async function refundFailedPayoutTransaction(
  transactionId: string,
  opts: {
    orderStatus: number;
    errorMsg?: string;
    errorCode?: string;
    sessionId?: string;
    orderNo?: string;
    /** Prefer exact debit hold when initiate catch races the fail webhook. */
    amountOverride?: number;
    /** Suppress push/in-app when caller notifies separately. */
    skipNotify?: boolean;
  }
): Promise<{ refunded: boolean; amount: number }> {
  const statusLabel = opts.orderStatus === 4 ? 'cancelled' : 'failed';
  const reason =
    String(opts.errorMsg || opts.errorCode || `PalmPay payout ${statusLabel}`).slice(0, 500);

  const result = await prisma.$transaction(async (tx) => {
    // Serialize concurrent fail webhooks + initiate-catch refunds on the same withdraw row
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        type: string;
        status: string;
        walletId: string;
        userId: number;
        totalAmount: any;
        metadata: string | null;
        palmpayOrderNo: string | null;
      }>
    >`SELECT id, type, status, walletId, userId, totalAmount, metadata, palmpayOrderNo
      FROM FiatTransaction WHERE id = ${transactionId} FOR UPDATE`;

    const txn = locked[0];
    if (!txn || txn.type !== 'WITHDRAW') {
      return { refunded: false, amount: 0, userId: 0 };
    }

    const meta = parseMeta(txn.metadata);
    if (meta.payoutRefundedAt || txn.status === 'refunded') {
      if (txn.status !== 'refunded') {
        await tx.fiatTransaction.update({
          where: { id: txn.id },
          data: { status: 'refunded' },
        });
      }
      return {
        refunded: false,
        amount: Number(meta.payoutRefundAmount || 0),
        userId: txn.userId,
      };
    }

    const override =
      opts.amountOverride != null && Number.isFinite(opts.amountOverride)
        ? Number(opts.amountOverride)
        : null;
    const refundAmount =
      override != null && override > 0 ? new Decimal(override) : new Decimal(txn.totalAmount || 0);
    const amountNum = refundAmount.toNumber();
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      await tx.fiatTransaction.update({
        where: { id: txn.id },
        data: {
          status: 'failed',
          palmpayStatus: String(opts.orderStatus),
          errorMessage: reason,
          ...(opts.sessionId ? { palmpaySessionId: String(opts.sessionId) } : {}),
          ...(opts.orderNo && !txn.palmpayOrderNo ? { palmpayOrderNo: opts.orderNo } : {}),
          metadata: JSON.stringify({
            ...meta,
            payoutFailedAt: new Date().toISOString(),
            payoutFailReason: reason,
          }),
        },
      });
      return { refunded: false, amount: 0, userId: txn.userId };
    }

    // Debited holds: pending/completed/successful. Also allow `failed` so initiate-catch
    // and fail-webhook can race safely under the payoutRefundedAt claim (no double credit).
    const shouldRefund =
      txn.status === 'completed' ||
      txn.status === 'pending' ||
      txn.status === 'successful' ||
      txn.status === 'failed';

    let balanceAfterRefund: Decimal | null = null;
    if (shouldRefund) {
      const walletLocked = await tx.$queryRaw<
        Array<{ id: string; balance: any; status: string }>
      >`SELECT id, balance, status FROM FiatWallet WHERE id = ${txn.walletId} FOR UPDATE`;
      const wallet = walletLocked[0];
      if (!wallet) throw new Error('Wallet not found for payout refund');
      balanceAfterRefund = new Decimal(wallet.balance).plus(refundAmount);
      await tx.$executeRaw`
        UPDATE FiatWallet
        SET balance = balance + ${amountNum}, updatedAt = NOW(3)
        WHERE id = ${wallet.id}
      `;
    }

    await tx.fiatTransaction.update({
      where: { id: txn.id },
      data: {
        // App-facing: "refunded" when money returned; "failed" only if no refund applied
        status: shouldRefund ? 'refunded' : 'failed',
        palmpayStatus: String(opts.orderStatus),
        errorMessage: reason,
        ...(opts.sessionId ? { palmpaySessionId: String(opts.sessionId) } : {}),
        ...(opts.orderNo && !txn.palmpayOrderNo ? { palmpayOrderNo: opts.orderNo } : {}),
        metadata: JSON.stringify({
          ...meta,
          payoutFailedAt: new Date().toISOString(),
          payoutFailReason: reason,
          ...(shouldRefund
            ? {
                payoutRefundedAt: new Date().toISOString(),
                payoutRefundAmount: amountNum,
                payoutRefundBalanceAfter: balanceAfterRefund?.toString(),
              }
            : {}),
        }),
      },
    });

    return {
      refunded: shouldRefund,
      amount: shouldRefund ? amountNum : 0,
      userId: txn.userId,
    };
  });

  if (result.refunded && result.userId && !opts.skipNotify) {
    const userId = result.userId;
    const amountStr = Number(result.amount).toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const title = 'Withdrawal refunded';
    const description = `Your withdrawal of ₦${amountStr} could not be completed${
      opts.errorMsg ? `: ${String(opts.errorMsg).slice(0, 120)}` : ''
    }. The amount has been returned to your wallet.`;

    try {
      await prisma.inAppNotification.create({
        data: {
          userId,
          title,
          description: description.slice(0, 500),
          type: InAppNotificationType.customeer,
        },
      });
      await sendPushNotification({
        userId,
        title,
        body: description.slice(0, 200),
        sound: 'default',
        priority: 'high',
        data: {
          type: 'withdraw',
          status: 'refunded',
          transactionId,
        },
      });
    } catch (notifyErr: any) {
      palmpayLogger.error('PalmPay payout fail notify error', notifyErr, { transactionId, userId });
    }
  }

  palmpayLogger.info('PalmPay payout webhook: failure handled', {
    transactionId,
    orderStatus: opts.orderStatus,
    refunded: result.refunded,
    amount: result.amount,
    reason,
  });

  return { refunded: result.refunded, amount: result.amount };
}
