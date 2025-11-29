/**
 * Tatum Webhook Controller
 * 
 * Handles incoming webhooks from Tatum
 */

import { Request, Response, NextFunction } from 'express';
import { processBlockchainWebhook } from '../../jobs/tatum/process.webhook.job';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Receive Tatum webhook
 * POST /api/v2/webhooks/tatum
 */
export const tatumWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const webhookData = req.body;

    // Log webhook for debugging
    console.log('Received Tatum webhook:', JSON.stringify(webhookData, null, 2));

    // Process webhook asynchronously (don't block response)
    processBlockchainWebhook(webhookData).catch((error) => {
      console.error('Error processing webhook:', error);
    });

    // Return success immediately (Tatum expects 200 response)
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received successfully').send(res);
  } catch (error) {
    console.error('Error in webhook controller:', error);
    // Still return 200 to prevent Tatum from retrying
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received').send(res);
  }
};

