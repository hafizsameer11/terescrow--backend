import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatDetailsController,
  sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { getTransactionBydepartment, getTransactionGroupData, getCryptoRatesByType } from '../../controllers/customer/utilities.controller';
import { saveFcmTokenController } from '../../controllers/public.controllers';

const customerUtilityrouter = express.Router();

/**
 * @swagger
 * /api/customer/utilities/get-transaction-group:
 *   get:
 *     summary: Get grouped transaction data
 *     tags: [Customer Utilities]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transaction groups retrieved successfully
 */
customerUtilityrouter.get('/get-transaction-group', authenticateUser, getTransactionGroupData);

/**
 * @swagger
 * /api/customer/utilities/get-transaction-by-department/{id}:
 *   get:
 *     summary: Get transactions by department
 *     tags: [Customer Utilities]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Department ID
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 */
customerUtilityrouter.get('/get-transaction-by-department/:id', authenticateUser, getTransactionBydepartment);

/**
 * @swagger
 * /api/customer/utilities/sve-fcm-token:
 *   post:
 *     summary: Save Firebase Cloud Messaging token
 *     tags: [Customer Utilities]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token for push notifications
 *     responses:
 *       200:
 *         description: FCM token saved successfully
 */
customerUtilityrouter.post('/sve-fcm-token', authenticateUser, saveFcmTokenController);

/**
 * @swagger
 * /api/customer/utilities/crypto-rates/{type}:
 *   get:
 *     summary: Get crypto exchange rate tiers for a transaction type
 *     tags: [Customer Utilities]
 *     description: |
 *       Returns all active exchange rate tiers for the given transaction type
 *       (e.g. BUY, SELL), ordered by amount range. Also returns the "bestRate"
 *       which is the most attractive rate (highest trade-amount tier) for
 *       upfront display before the user enters their amount.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [BUY, SELL, SWAP, SEND, RECEIVE]
 *         description: Transaction type
 *     responses:
 *       200:
 *         description: Rates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   type: object
 *                   properties:
 *                     tiers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           transactionType:
 *                             type: string
 *                           minAmount:
 *                             type: number
 *                             description: Minimum USD amount for this tier
 *                           maxAmount:
 *                             type: number
 *                             nullable: true
 *                             description: Maximum USD amount (null = unlimited)
 *                           rate:
 *                             type: number
 *                             description: NGN per $1
 *                     bestRate:
 *                       type: object
 *                       nullable: true
 *                       description: The most attractive rate tier (highest trade-amount tier)
 *                 message:
 *                   type: string
 */
customerUtilityrouter.get('/crypto-rates/:type', authenticateUser, getCryptoRatesByType);

export default customerUtilityrouter;
