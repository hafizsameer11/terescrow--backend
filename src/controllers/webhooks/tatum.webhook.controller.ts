/**
 * Tatum Webhook Controller
 * 
 * Handles incoming webhooks from Tatum
 */

import { Request, Response, NextFunction } from 'express';
import { processBlockchainWebhook } from '../../jobs/tatum/process.webhook.job';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import tatumLogger from '../../utils/tatum.logger';

/**
 * Receive Tatum webhook
 * POST /api/v2/webhooks/tatum
 */
export const tatumWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let rawWebhookId: number | null = null;

  try {
    const webhookData = req.body;

    // ============================================
    // ✅ SAVE RAW WEBHOOK IMMEDIATELY
    // ============================================
    try {
      const rawWebhook = await prisma.tatumRawWebhook.create({
        data: {
          rawData: JSON.stringify(webhookData),
          headers: JSON.stringify(req.headers),
          ipAddress: req.ip || req.socket.remoteAddress || null,
          userAgent: req.get('user-agent') || null,
          processed: false,
        },
      });

      rawWebhookId = rawWebhook.id;
      tatumLogger.webhookReceived(webhookData, req.headers, req.ip);
      tatumLogger.info(`Saved raw Tatum webhook (ID: ${rawWebhookId})`, {
        rawWebhookId,
        accountId: webhookData?.accountId,
        reference: webhookData?.reference,
        txId: webhookData?.txId,
      });
    } catch (saveError: any) {
      tatumLogger.exception('Save raw Tatum webhook', saveError, {
        webhookData: webhookData?.accountId || 'unknown',
      });
      // Continue even if save fails - don't block webhook receipt
    }

    // Process webhook asynchronously (don't block response)
    // Update raw webhook after processing
    processBlockchainWebhook(webhookData)
      .then(async (result) => {
        if (rawWebhookId) {
          try {
            const errorMessage = result.processed === false && 'reason' in result 
              ? (result as { processed: false; reason: string }).reason || 'Not processed'
              : null;

            await prisma.tatumRawWebhook.update({
              where: { id: rawWebhookId },
              data: {
                processed: true,
                processedAt: new Date(),
                ...(errorMessage ? { errorMessage } : {}),
              },
            });
            tatumLogger.info(`Marked raw webhook ${rawWebhookId} as processed`, { rawWebhookId, result });
          } catch (updateError: any) {
            tatumLogger.exception('Update raw webhook status', updateError, { rawWebhookId });
          }
        }
      })
      .catch(async (error) => {
        tatumLogger.exception('Process Tatum webhook', error, {
          rawWebhookId,
          webhookData: webhookData?.accountId || 'unknown',
        });
        
        if (rawWebhookId) {
          try {
            await prisma.tatumRawWebhook.update({
              where: { id: rawWebhookId },
              data: {
                processed: true,
                processedAt: new Date(),
                errorMessage: error?.message || 'Unknown error during processing',
              },
            });
          } catch (updateError: any) {
            tatumLogger.exception('Update raw webhook error status', updateError, { rawWebhookId });
          }
        }
      });

    // Return success immediately (Tatum expects 200 response)
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received successfully').send(res);
  } catch (error: any) {
    tatumLogger.exception('Tatum webhook controller', error, {
      rawWebhookId,
    });
    
    // Still return 200 to prevent Tatum from retrying
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received').send(res);
  }
};

