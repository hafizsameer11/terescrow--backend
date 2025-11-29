import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PalmPayOrderStatus } from '../../types/palmpay.types';

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
 */
export async function processBillPaymentStatusJob(
  job: Job<BillPaymentStatusJobData>
): Promise<void> {
  const { billPaymentId, sceneCode, outOrderNo, orderNo } = job.data;

  try {
    // Find the bill payment record
    const billPayment = await prisma.billPayment.findUnique({
      where: { id: billPaymentId },
      include: { transaction: true, wallet: true },
    });

    if (!billPayment) {
      throw new Error(`Bill payment not found: ${billPaymentId}`);
    }

    // Skip if already completed or failed
    if (['completed', 'failed', 'cancelled'].includes(billPayment.status)) {
      console.log(`[Job] Bill payment ${billPaymentId} already in final state: ${billPayment.status}`);
      return;
    }

    // Query PalmPay for order status
    const orderStatus = await palmpayBillPaymentService.queryOrderStatus(
      sceneCode as any,
      outOrderNo || billPayment.palmpayOrderId || undefined,
      orderNo || billPayment.palmpayOrderNo || undefined
    );

    const statusMap: Record<number, string> = {
      1: 'pending',
      2: 'completed',
      3: 'failed',
      4: 'cancelled',
    };

    const newStatus = statusMap[orderStatus.orderStatus] || 'pending';

    // Handle wallet refunds for failed/cancelled orders
    if (
      (orderStatus.orderStatus === PalmPayOrderStatus.FAILED ||
        orderStatus.orderStatus === PalmPayOrderStatus.CANCELLED) &&
      billPayment.status === 'pending'
    ) {
      try {
        const refundAmount = billPayment.amount.toNumber();
        const currentWallet = await prisma.fiatWallet.findUnique({
          where: { id: billPayment.walletId },
        });

        if (currentWallet) {
          const refundBalance = new Decimal(currentWallet.balance).plus(refundAmount);
          await prisma.fiatWallet.update({
            where: { id: billPayment.walletId },
            data: { balance: refundBalance },
          });

          // Create refund transaction record
          await prisma.fiatTransaction.create({
            data: {
              id: require('uuid').v4(),
              userId: billPayment.userId,
              walletId: billPayment.walletId,
              type: 'BILL_PAYMENT',
              status: 'completed',
              currency: billPayment.currency,
              amount: refundAmount,
              fees: 0,
              totalAmount: refundAmount,
              description: `Refund for ${orderStatus.orderStatus === PalmPayOrderStatus.FAILED ? 'failed' : 'cancelled'} bill payment: ${billPayment.id}`,
              metadata: JSON.stringify({
                originalTransactionId: billPayment.transactionId,
                reason: `PalmPay payment ${orderStatus.orderStatus === PalmPayOrderStatus.FAILED ? 'failed' : 'cancelled'}`,
              }),
              completedAt: new Date(),
            },
          });
        }
      } catch (refundError) {
        console.error('Failed to refund wallet for bill payment:', refundError);
        // Log for manual intervention
      }
    }

    // Update BillPayment record
    await prisma.billPayment.update({
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
    await prisma.fiatTransaction.update({
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

    console.log(`[Job] Bill payment ${billPaymentId} status updated to: ${newStatus}`);
  } catch (error: any) {
    console.error(`[Job] Error processing bill payment status job:`, error.message);
    throw error; // Re-throw to mark job as failed
  }
}

