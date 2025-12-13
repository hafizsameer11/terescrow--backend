import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { PalmPayOrderStatus } from '../../types/palmpay.types';
import palmpayLogger from '../../utils/palmpay.logger';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Bill Payment Status Check Job Data
 */
export interface BillPaymentStatusJobData {
  billPaymentId: string;
  sceneCode: string;
  outOrderNo?: string;
  orderNo?: string;
}

/**
 * Process Bill Payment Status Check Job
 * This job queries PalmPay for the status of a bill payment order
 * and updates the local database accordingly.
 * 
 * CRITICAL: This job is idempotent and uses database transactions with row locking
 * to prevent double refunds and ensure atomic updates.
 */
export async function processBillPaymentStatusJob(
  job: Job<BillPaymentStatusJobData>
): Promise<void> {
  const { billPaymentId, sceneCode, outOrderNo, orderNo } = job.data;

  try {
    palmpayLogger.statusCheck({ billPaymentId, jobId: job.id, sceneCode, outOrderNo, orderNo });

    // Find the bill payment record
    const billPayment = await prisma.billPayment.findUnique({
      where: { id: billPaymentId },
      include: { transaction: true, wallet: true },
    });

    if (!billPayment) {
      const error = new Error(`Bill payment not found: ${billPaymentId}`);
      palmpayLogger.exception('Bill payment status check', error, { billPaymentId });
      throw error;
    }

    palmpayLogger.billPayment('Found bill payment', {
      billPaymentId,
      userId: billPayment.userId,
      amount: billPayment.amount.toString(),
      currency: billPayment.currency,
      currentStatus: billPayment.status,
      palmpayOrderId: billPayment.palmpayOrderId,
      palmpayOrderNo: billPayment.palmpayOrderNo,
    });

    // Skip if already completed or failed (idempotency check)
    if (['completed', 'failed', 'cancelled'].includes(billPayment.status)) {
      palmpayLogger.info(`Bill payment ${billPaymentId} already in final state: ${billPayment.status}`);
      return;
    }

    // Query PalmPay for order status
    palmpayLogger.apiCall('queryOrderStatus', {
      sceneCode,
      outOrderNo: outOrderNo || billPayment.palmpayOrderId,
      orderNo: orderNo || billPayment.palmpayOrderNo,
    });

    const orderStatus = await palmpayBillPaymentService.queryOrderStatus(
      sceneCode as any,
      outOrderNo || billPayment.palmpayOrderId || undefined,
      orderNo || billPayment.palmpayOrderNo || undefined
    );

    palmpayLogger.apiCall('queryOrderStatus', undefined, orderStatus);

    const statusMap: Record<number, string> = {
      1: 'pending',
      2: 'completed',
      3: 'failed',
      4: 'cancelled',
    };

    const newStatus = statusMap[orderStatus.orderStatus] || 'pending';

    // Handle wallet refunds for failed/cancelled orders
    // CRITICAL: Use transaction with row locking to prevent double refunds
    if (
      (orderStatus.orderStatus === PalmPayOrderStatus.FAILED ||
        orderStatus.orderStatus === PalmPayOrderStatus.CANCELLED) &&
      billPayment.status === 'pending'
    ) {
      try {
        // Use transaction with row locking to ensure atomicity and prevent double refunds
        await prisma.$transaction(async (tx) => {
          // Lock the row for update - prevents concurrent refunds
          const lockedBillPayment = await tx.$queryRaw<Array<{
            id: string;
            status: string;
            refunded: boolean;
            amount: number;
            walletId: string;
            userId: number;
            transactionId: string;
            currency: string;
          }>>`
            SELECT id, status, refunded, amount, "walletId", "userId", "transactionId", currency
            FROM "BillPayment"
            WHERE id = ${billPaymentId}
            FOR UPDATE
          `;

          if (!lockedBillPayment || lockedBillPayment.length === 0) {
            throw new Error(`Bill payment not found (after lock): ${billPaymentId}`);
          }

          const bp = lockedBillPayment[0];

          // Check if already refunded (idempotency check)
          if (bp.refunded) {
            palmpayLogger.warn(`Bill payment ${billPaymentId} already refunded, skipping refund`, {
              billPaymentId,
              status: bp.status,
              refunded: bp.refunded,
            });
            return;
          }

          // Double-check status is still pending
          if (bp.status !== 'pending') {
            palmpayLogger.warn(`Bill payment ${billPaymentId} status is ${bp.status}, skipping refund`, {
              billPaymentId,
              status: bp.status,
            });
            return;
          }

          const refundAmount = parseFloat(bp.amount.toString());
          const refundReason = orderStatus.orderStatus === PalmPayOrderStatus.FAILED 
            ? 'PalmPay payment failed' 
            : 'PalmPay payment cancelled';

          palmpayLogger.refund({
            billPaymentId,
            amount: refundAmount,
            reason: refundReason,
            walletId: bp.walletId,
            userId: bp.userId,
            currency: bp.currency,
          });

          // CRITICAL: Use atomic increment instead of calculating balance
          // This prevents race conditions with concurrent balance updates
          // Get current balance for transaction record
          const wallet = await tx.fiatWallet.findUnique({
            where: { id: bp.walletId },
            select: { balance: true },
          });

          if (!wallet) {
            throw new Error(`Wallet not found: ${bp.walletId}`);
          }

          // Use raw SQL for atomic increment (Prisma doesn't support atomic increment on Decimal)
          await tx.$executeRaw`
            UPDATE "FiatWallet"
            SET balance = balance + ${refundAmount}::decimal
            WHERE id = ${bp.walletId}
          `;

          const balanceAfter = new Decimal(wallet.balance).plus(refundAmount);

          // Create refund transaction record
          await tx.fiatTransaction.create({
            data: {
              id: require('uuid').v4(),
              userId: bp.userId,
              walletId: bp.walletId,
              type: 'BILL_PAYMENT',
              status: 'completed',
              currency: bp.currency,
              amount: refundAmount,
              fees: 0,
              totalAmount: refundAmount,
              balanceBefore: wallet.balance,
              balanceAfter: balanceAfter,
              description: `Refund for ${refundReason}: ${billPaymentId}`,
              metadata: JSON.stringify({
                originalTransactionId: bp.transactionId,
                reason: refundReason,
                billPaymentId: bp.id,
              }),
              completedAt: new Date(),
            },
          });

          // Mark as refunded and update status atomically using Prisma
          await tx.billPayment.update({
            where: { id: billPaymentId },
            data: {
              refunded: true,
              refundedAt: new Date(),
              refundReason: refundReason,
              status: newStatus,
            },
          });

          palmpayLogger.refund({
            status: 'COMPLETE',
            billPaymentId,
            amount: refundAmount,
            reason: refundReason,
            walletId: bp.walletId,
            userId: bp.userId,
          });
        }, {
          timeout: 10000, // 10 second timeout
        });
      } catch (refundError: any) {
        palmpayLogger.exception('Wallet refund failed', refundError, {
          billPaymentId,
          orderStatus: orderStatus.orderStatus,
          amount: billPayment.amount.toString(),
          walletId: billPayment.walletId,
        });
        // Don't throw - log for manual intervention but continue with status update
      }
    }

    // Update BillPayment and FiatTransaction records atomically
    // This ensures database consistency even if one update fails
    await prisma.$transaction(async (tx) => {
      // Update BillPayment record
      await tx.billPayment.update({
        where: { id: billPayment.id },
        data: {
          palmpayStatus: orderStatus.orderStatus.toString(),
          status: newStatus,
          ...(orderStatus.orderStatus === 2 && orderStatus.completedTime
            ? { completedAt: new Date(orderStatus.completedTime) }
            : {}),
          ...(orderStatus.errorMsg ? { errorMessage: orderStatus.errorMsg } : {}),
          providerResponse: JSON.stringify(orderStatus),
          ...(orderStatus.orderStatus === 2 ? { billReference: orderStatus.orderNo } : {}),
        },
      });

      // Update related transaction
      await tx.fiatTransaction.update({
        where: { id: billPayment.transactionId },
        data: {
          palmpayStatus: orderStatus.orderStatus.toString(),
          status: newStatus,
          ...(orderStatus.orderStatus === 2 && orderStatus.completedTime
            ? { completedAt: new Date(orderStatus.completedTime) }
            : {}),
          ...(orderStatus.errorMsg ? { errorMessage: orderStatus.errorMsg } : {}),
        },
      });
    }, {
      timeout: 10000, // 10 second timeout
    });

    palmpayLogger.transactionUpdate({
      billPaymentId,
      transactionId: billPayment.transactionId,
      oldStatus: billPayment.status,
      newStatus,
      palmpayOrderStatus: orderStatus.orderStatus,
      orderStatus: orderStatus.orderStatus.toString(),
      completedAt: orderStatus.completedTime ? new Date(orderStatus.completedTime) : null,
      billReference: orderStatus.orderStatus === 2 ? orderStatus.orderNo : null,
    });

    palmpayLogger.billPayment('Status updated', {
      billPaymentId,
      oldStatus: billPayment.status,
      newStatus,
      orderStatus: orderStatus.orderStatus,
    });
  } catch (error: any) {
    palmpayLogger.exception('Bill payment status check', error, {
      billPaymentId,
      jobId: job.id,
      jobData: job.data,
    });
    throw error; // Re-throw to mark job as failed
  }
}
