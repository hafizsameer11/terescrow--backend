/**
 * Tatum Webhook Routes
 */

import express from 'express';
import { tatumWebhookController } from '../../controllers/webhooks/tatum.webhook.controller';

const tatumWebhookRouter = express.Router();

/**
 * @swagger
 * /api/v2/webhooks/tatum:
 *   post:
 *     summary: Receive Tatum webhook
 *     tags: [Webhooks]
 *     description: Endpoint for Tatum to send blockchain transaction webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *               subscriptionType:
 *                 type: string
 *               amount:
 *                 type: string
 *               currency:
 *                 type: string
 *               reference:
 *                 type: string
 *               txId:
 *                 type: string
 *               from:
 *                 type: string
 *               to:
 *                 type: string
 *               date:
 *                 type: number
 *               blockHeight:
 *                 type: number
 *               blockHash:
 *                 type: string
 *               index:
 *                 type: number
 *     responses:
 *       200:
 *         description: Webhook received successfully
 */
tatumWebhookRouter.post('/', tatumWebhookController);

export default tatumWebhookRouter;

