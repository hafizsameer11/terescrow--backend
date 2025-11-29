import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import { prisma } from '../../utils/prisma';
import { palmpayAuth } from '../../services/palmpay/palmpay.auth.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { PalmPayDepositWebhook, PalmPayPayoutWebhook, PalmPayOrderStatus, PalmPayBillPaymentWebhook } from '../../types/palmpay.types';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * PalmPay Webhook Handler
 * Handles both deposit and payout webhooks
 * POST /api/v2/webhooks/palmpay
 * 
 * CRITICAL: Must return plain text "success" (not JSON)
 */
export const palmpayWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const webhookData = req.body as PalmPayDepositWebhook | PalmPayPayoutWebhook | PalmPayBillPaymentWebhook;

    // Extract signature and verify
    const signature = webhookData.sign;
    if (!signature) {
      console.error('PalmPay webhook missing signature');
      // Still return success to prevent retries
      return res.status(200).send('success');
    }

    // Verify signature
    const isValid = palmpayAuth.verifyWebhookSignature(webhookData, signature);
    if (!isValid) {
      console.error('PalmPay webhook signature verification failed');
      // Still return success to prevent retries (but log the issue)
      return res.status(200).send('success');
    }

    // Determine order identifier based on webhook type
    let orderId: string | undefined;
    let orderNo: string | undefined;

    if ('orderId' in webhookData) {
      orderId = webhookData.orderId;
    } else if ('outOrderNo' in webhookData) {
      orderId = webhookData.outOrderNo; // Bill payment uses outOrderNo
    }

    if ('orderNo' in webhookData) {
      orderNo = webhookData.orderNo;
    }

    // Check if this is a bill payment webhook (has outOrderNo)
    const isBillPayment = 'outOrderNo' in webhookData;

    let transaction;
    let billPayment;

    if (isBillPayment) {
      // Bill payment webhook - find BillPayment record
      billPayment = await prisma.billPayment.findFirst({
        where: {
          OR: [
            ...(webhookData.outOrderNo ? [{ palmpayOrderId: webhookData.outOrderNo }] : []),
            ...(orderNo ? [{ palmpayOrderNo: orderNo }] : []),
          ],
        },
        include: { wallet: true, transaction: true },
      });

      if (!billPayment) {
        console.error(`PalmPay webhook: BillPayment not found for outOrderNo: ${webhookData.outOrderNo}, orderNo: ${orderNo}`);
        return res.status(200).send('success');
      }

      transaction = billPayment.transaction;
    } else {
      // Regular transaction webhook (deposit/payout)
      transaction = await prisma.fiatTransaction.findFirst({
        where: {
          OR: [
            ...(orderId ? [{ palmpayOrderId: orderId }] : []),
            ...(orderNo ? [{ palmpayOrderNo: orderNo }] : []),
          ],
        },
        include: { wallet: true },
      });

      if (!transaction) {
        console.error(`PalmPay webhook: Transaction not found for orderId: ${orderId}, orderNo: ${orderNo}`);
        return res.status(200).send('success');
      }
    }

    // Check if already processed (idempotency)
    const orderStatus = webhookData.orderStatus;
    if (transaction.status === 'completed' && orderStatus === PalmPayOrderStatus.SUCCESS) {
      console.log(`PalmPay webhook: Transaction ${transaction.id} already processed`);
      return res.status(200).send('success');
    }

    if (orderStatus === PalmPayOrderStatus.SUCCESS) {
      // Payment successful
      if (transaction.type === 'DEPOSIT') {
        // Credit wallet
        const amountInCurrency = webhookData.amount / 100; // Convert cents to currency
        await fiatWalletService.creditWallet(
          transaction.walletId,
          amountInCurrency,
          transaction.id,
          'Deposit via PalmPay'
        );
      } else if (transaction.type === 'WITHDRAW') {
        // Debit wallet (if not already debited)
        if (transaction.status !== 'completed') {
          const totalAmount = transaction.totalAmount.toNumber();
          await fiatWalletService.debitWallet(
            transaction.walletId,
            totalAmount,
            transaction.id,
            'Withdrawal via PalmPay'
          );
        }
      } else if (transaction.type === 'BILL_PAYMENT' && billPayment) {
        // Bill payment: Wallet was already debited when order was created
        // Update BillPayment record
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            status: 'completed',
            palmpayStatus: orderStatus.toString(),
            completedAt: 'completedTime' in webhookData && webhookData.completedTime
              ? new Date(webhookData.completedTime)
              : new Date(),
            billReference: webhookData.orderNo,
          },
        });
      }

      // Update transaction
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'completed',
          palmpayStatus: orderStatus.toString(),
          palmpaySessionId: 'sessionId' in webhookData ? webhookData.sessionId : undefined,
          completedAt: 'completedTime' in webhookData && webhookData.completedTime
            ? new Date(webhookData.completedTime)
            : 'completeTime' in webhookData && webhookData.completeTime
            ? new Date(webhookData.completeTime)
            : new Date(),
          ...(transaction.type === 'BILL_PAYMENT' && 'outOrderNo' in webhookData
            ? { billReference: webhookData.orderNo }
            : {}),
        },
      });
    } else if (orderStatus === PalmPayOrderStatus.FAILED) {
      // Payment failed
      if (transaction.type === 'BILL_PAYMENT' && billPayment && billPayment.status === 'pending') {
        // Refund the wallet (it was debited when order was created)
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
          }
        } catch (refundError) {
          console.error('Failed to refund wallet for failed bill payment:', refundError);
          // Log for manual intervention
        }

        // Update BillPayment record
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            status: 'failed',
            palmpayStatus: orderStatus.toString(),
            errorMessage: 'errorMsg' in webhookData ? webhookData.errorMsg : 'Payment failed',
          },
        });
      }

      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          palmpayStatus: orderStatus.toString(),
          errorMessage: 'errorMsg' in webhookData ? webhookData.errorMsg : 'Payment failed',
        },
      });
    } else if (orderStatus === PalmPayOrderStatus.CANCELLED) {
      // Payment cancelled
      if (transaction.type === 'BILL_PAYMENT' && billPayment && billPayment.status === 'pending') {
        // Refund the wallet
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
          }
        } catch (refundError) {
          console.error('Failed to refund wallet for cancelled bill payment:', refundError);
        }

        // Update BillPayment record
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            status: 'cancelled',
            palmpayStatus: orderStatus.toString(),
          },
        });
      }

      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'cancelled',
          palmpayStatus: orderStatus.toString(),
        },
      });
    }
    // PENDING status - do nothing, wait for next webhook

    // CRITICAL: Return plain text "success" (not JSON)
    return res.status(200).send('success');
  } catch (error: any) {
    console.error('PalmPay webhook error:', error);
    // Always return success to prevent retries
    // Log the error for investigation
    return res.status(200).send('success');
  }
};

