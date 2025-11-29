import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatDetailsController,
  sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { getTransactionBydepartment, getTransactionGroupData } from '../../controllers/customer/utilities.controller';
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

export default customerUtilityrouter;
