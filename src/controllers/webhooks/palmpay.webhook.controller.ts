import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import { prisma } from '../../utils/prisma';
import { palmpayAuth } from '../../services/palmpay/palmpay.auth.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { PalmPayDepositWebhook, PalmPayPayoutWebhook, PalmPayOrderStatus, PalmPayBillPaymentWebhook } from '../../types/palmpay.types';
import { Decimal } from '@prisma/client/runtime/library';
import palmpayLogger from '../../utils/palmpay.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

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
  // ============================================
  // ✅ SAVE RAW WEBHOOK IMMEDIATELY
  // ============================================

  let rawWebhookId: number | null = null;

  try {
    const webhookData = req.body;
    
    const rawWebhook = await prisma.palmPayRawWebhook.create({
      data: {
        rawData: JSON.stringify(webhookData),
        headers: JSON.stringify(req.headers),
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
        processed: false,
      },
    });

    rawWebhookId = rawWebhook.id;
    palmpayLogger.webhookReceived(webhookData, req.headers, req.ip);
    palmpayLogger.info(`Saved raw PalmPay webhook (ID: ${rawWebhookId})`, {
      rawWebhookId,
      orderNo: webhookData?.orderNo,
      outOrderNo: webhookData?.outOrderNo,
      orderStatus: webhookData?.orderStatus,
    });
  } catch (saveError: any) {
    palmpayLogger.exception('Save raw PalmPay webhook', saveError, {
      webhookData: req.body?.orderNo || req.body?.outOrderNo || 'unknown',
    });
    // Continue even if save fails - don't block webhook receipt
  }

  // ============================================
  // ✅ PROCESS WEBHOOK
  // ============================================

  try {
    const webhookData = req.body as any; // Use any to handle extra fields like transType, orderType, etc.

    // Skip signature validation for now (as requested)
    // const signature = webhookData.sign;
    // if (!signature) return res.status(200).send("success");
    // const isValid = palmpayAuth.verifyWebhookSignature(webhookData, signature);
    // if (!isValid) return res.status(200).send("success");

    const orderId = webhookData.orderId; // This is the merchantOrderId
    const orderNo = webhookData.orderNo;
    const orderStatus = webhookData.orderStatus;
    const amount = webhookData.amount; // Amount in cents
    const currency = webhookData.currency || 'NGN';
    const completeTime = webhookData.completeTime || webhookData.completedTime; // Handle both field names

    palmpayLogger.info('Processing PalmPay webhook', {
      orderId,
      orderNo,
      orderStatus,
      amount,
      currency,
      rawWebhookId,
    });

    // Check if this is a deposit webhook (has orderId that starts with "deposit_")
    if (orderId && orderId.startsWith('deposit_')) {
      // Find the PalmPayUserVirtualAccount by merchantOrderId
      const virtualAccountRecord = await prisma.palmPayUserVirtualAccount.findUnique({
        where: { merchantOrderId: orderId },
        include: {
          user: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
            },
          },
        },
      });

      if (!virtualAccountRecord) {
        palmpayLogger.warn(`PalmPay deposit webhook: Virtual account record not found for orderId ${orderId}`, {
          orderId,
          orderNo,
        });
        
        // Mark webhook as processed even if not found
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `Virtual account record not found for orderId: ${orderId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      const userId = virtualAccountRecord.userId;
      const fiatTransactionId = virtualAccountRecord.fiatTransactionId;

      if (!fiatTransactionId) {
        palmpayLogger.warn(`PalmPay deposit webhook: No fiatTransactionId found for orderId ${orderId}`, {
          orderId,
          orderNo,
          virtualAccountRecordId: virtualAccountRecord.id,
        });
        
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `No fiatTransactionId found for orderId: ${orderId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      // Find the fiat transaction
      const transaction = await prisma.fiatTransaction.findUnique({
        where: { id: fiatTransactionId },
        include: {
          wallet: true,
        },
      });

      if (!transaction) {
        palmpayLogger.warn(`PalmPay deposit webhook: Transaction not found for id ${fiatTransactionId}`, {
          orderId,
          orderNo,
          fiatTransactionId,
        });
        
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `Transaction not found for id: ${fiatTransactionId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      // ============================================
      // ✅ IDEMPOTENCY CHECK - Prevent duplicate processing
      // ============================================
      // Check if transaction is already completed - this is our source of truth
      // The webhook always sends orderStatus=2 for success, so we can't rely on that
      // Instead, we check our transaction record status
      if (transaction.status === 'completed') {
        palmpayLogger.info(`PalmPay deposit webhook: Already processed - skipping duplicate webhook`, {
          orderId,
          orderNo,
          transactionId: fiatTransactionId,
          transactionStatus: transaction.status,
          palmpayOrderNo: transaction.palmpayOrderNo,
        });
        
        // Update virtual account record with latest orderNo if different (idempotent update)
        if (virtualAccountRecord.palmpayOrderNo !== orderNo || virtualAccountRecord.orderStatus !== orderStatus) {
          await prisma.palmPayUserVirtualAccount.update({
            where: { id: virtualAccountRecord.id },
            data: {
              palmpayOrderNo: orderNo,
              orderStatus: orderStatus,
            },
          });
        }
        
        // Mark raw webhook as processed but skip actual processing
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
            },
          });
        }
        return res.status(200).send("success");
      }

      // Update virtual account record with latest status (only if changed)
      if (virtualAccountRecord.palmpayOrderNo !== orderNo || virtualAccountRecord.orderStatus !== orderStatus) {
        await prisma.palmPayUserVirtualAccount.update({
          where: { id: virtualAccountRecord.id },
          data: {
            palmpayOrderNo: orderNo,
            orderStatus: orderStatus,
          },
        });
      }

      // Process based on order status
      if (orderStatus === 2) {
        // SUCCESS - Credit the wallet
        // Note: We already checked if transaction is completed above, so we only reach here if it's NOT completed
        // Convert amount from cents to decimal
        const amountInNgn = new Decimal(amount).dividedBy(100);

        // Credit the wallet
        try {
          await fiatWalletService.creditWallet(
            transaction.walletId,
            amountInNgn.toNumber(),
            fiatTransactionId,
            `Deposit via PalmPay - ${orderNo}`
          );

          palmpayLogger.info(`PalmPay deposit webhook: Wallet credited successfully`, {
            orderId,
            orderNo,
            transactionId: fiatTransactionId,
            walletId: transaction.walletId,
            amount: amountInNgn.toString(),
            currency,
            userId,
          });

          // Update transaction with PalmPay order number and completion time
          await prisma.fiatTransaction.update({
            where: { id: fiatTransactionId },
            data: {
              palmpayOrderNo: orderNo,
              palmpayStatus: orderStatus.toString(),
              ...(completeTime && {
                completedAt: new Date(completeTime),
              }),
            },
          });

          // Send notification to user
          try {
            const userName = virtualAccountRecord.user?.firstname || 'User';
            await sendPushNotification({
              userId: userId,
              title: 'Deposit Successful',
              body: `Your deposit of ${amountInNgn.toString()} ${currency} has been credited to your wallet successfully.`,
              sound: 'default',
              priority: 'high',
            });

            // Create in-app notification
            await prisma.inAppNotification.create({
              data: {
                userId: userId,
                title: 'Deposit Successful',
                description: `Your deposit of ${amountInNgn.toString()} ${currency} has been credited to your wallet. Order: ${orderNo}`,
                type: InAppNotificationType.customeer,
              },
            });

            palmpayLogger.info(`PalmPay deposit webhook: Notification sent to user ${userId}`, {
              orderId,
              orderNo,
              userId,
            });
          } catch (notifError: any) {
            palmpayLogger.exception('Send deposit notification', notifError, {
              orderId,
              orderNo,
              userId,
            });
            // Don't fail the webhook if notification fails
          }
        } catch (creditError: any) {
          palmpayLogger.exception('Credit wallet', creditError, {
            orderId,
            orderNo,
            transactionId: fiatTransactionId,
            walletId: transaction.walletId,
            amount: amountInNgn.toString(),
          });
          throw creditError;
        }
      } else if (orderStatus === 3 || orderStatus === 4) {
        // FAILED or CANCELLED
        const statusText = orderStatus === 3 ? 'failed' : 'cancelled';
        
        await prisma.fiatTransaction.update({
          where: { id: fiatTransactionId },
          data: {
            status: statusText,
            palmpayOrderNo: orderNo,
            palmpayStatus: orderStatus.toString(),
            ...(completeTime && {
              completedAt: new Date(completeTime),
            }),
          },
        });

        palmpayLogger.info(`PalmPay deposit webhook: Transaction marked as ${statusText}`, {
          orderId,
          orderNo,
          transactionId: fiatTransactionId,
          orderStatus,
        });
      }

      // Mark raw webhook as processed
      if (rawWebhookId) {
        await prisma.palmPayRawWebhook.update({
          where: { id: rawWebhookId },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });
        palmpayLogger.info(`Marked raw webhook ${rawWebhookId} as processed`, { rawWebhookId });
      }

      return res.status(200).send("success");
    } else {
      // Not a deposit webhook, might be payout or bill payment
      palmpayLogger.info('PalmPay webhook: Not a deposit webhook, skipping deposit processing', {
        orderId,
        orderNo,
        hasOutOrderNo: !!webhookData.outOrderNo, // Bill payment has outOrderNo
      });

      // Mark as processed anyway
      if (rawWebhookId) {
        await prisma.palmPayRawWebhook.update({
          where: { id: rawWebhookId },
          data: {
            processed: true,
            processedAt: new Date(),
            errorMessage: 'Not a deposit webhook',
          },
        });
      }

      return res.status(200).send("success");
    }
  } catch (error: any) {
    palmpayLogger.exception('Process PalmPay webhook', error, {
      rawWebhookId,
      webhookData: req.body?.orderNo || req.body?.outOrderNo || 'unknown',
    });

    if (rawWebhookId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: error?.message || "Unknown error",
        },
      });
    }

    // Always return success to prevent PalmPay retries
    return res.status(200).send("success");
  }
};


