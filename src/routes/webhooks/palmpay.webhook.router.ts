import { Router } from 'express';
import { palmpayWebhookController } from '../../controllers/webhooks/palmpay.webhook.controller';

const webhookRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Webhooks
 *   description: Webhook endpoints for payment notifications
 */

/**
 * @swagger
 * /api/v2/webhooks/palmpay:
 *   post:
 *     summary: PalmPay webhook handler
 *     tags: [V2 - Webhooks]
 *     description: |
 *       Receives payment notifications from PalmPay for:
 *       - Deposits (wallet top-up)
 *       - Payouts (bank transfers)
 *       - Bill Payments (airtime, data, betting)
 *       
 *       **CRITICAL**: Must return plain text "success" (not JSON) to prevent retries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 description: Deposit webhook
 *                 properties:
 *                   orderId:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *               - type: object
 *                 description: Payout webhook
 *                 properties:
 *                   orderId:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *               - type: object
 *                 description: Bill Payment webhook
 *                 properties:
 *                   outOrderNo:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully (returns plain text "success")
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "success"
 */
webhookRouter.post('/palmpay', palmpayWebhookController);

/**
 * @swagger
 * /api/v2/webhooks/palmpay/bill-payment:
 *   post:
 *     summary: PalmPay bill payment webhook handler
 *     tags: [V2 - Webhooks]
 *     description: |
 *       Receives bill payment notifications from PalmPay (airtime, data, betting).
 *       This is an alias for the main webhook endpoint.
 *       
 *       **CRITICAL**: Must return plain text "success" (not JSON) to prevent retries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               outOrderNo:
 *                 type: string
 *                 description: Merchant order number
 *               orderNo:
 *                 type: string
 *                 description: PalmPay platform order number
 *               appId:
 *                 type: string
 *                 description: Merchant APP ID
 *               amount:
 *                 type: number
 *                 description: Total order amount (in cents)
 *               rechargeAccount:
 *                 type: string
 *                 description: Recharge account (phone number, etc.)
 *               orderStatus:
 *                 type: integer
 *                 description: Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
 *               completedTime:
 *                 type: number
 *                 description: Transaction completion time (timestamp)
 *               sign:
 *                 type: string
 *                 description: Signature (URL encoded)
 *               errorMsg:
 *                 type: string
 *                 description: Error message (if failed)
 *     responses:
 *       200:
 *         description: Webhook processed successfully (returns plain text "success")
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "success"
 */
webhookRouter.post('/palmpay/bill-payment', palmpayWebhookController);

export default webhookRouter;

