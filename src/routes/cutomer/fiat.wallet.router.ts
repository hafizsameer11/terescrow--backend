import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getWalletOverviewController,
  getWalletTransactionsController,
  getWalletTransactionByIdController,
} from '../../controllers/customer/fiat.wallet.controller';

const walletRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Fiat Wallet
 *   description: Fiat wallet management endpoints
 */

/**
 * @swagger
 * /api/v2/wallets/overview:
 *   get:
 *     summary: Get wallet overview
 *     tags: [V2 - Fiat Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet overview retrieved successfully
 */
walletRouter.get('/overview', authenticateUser, getWalletOverviewController);

/**
 * @swagger
 * /api/v2/wallets/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     tags: [V2 - Fiat Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DEPOSIT, WITHDRAW, BILL_PAYMENT, TRANSFER]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 */
walletRouter.get('/transactions', authenticateUser, getWalletTransactionsController);

/**
 * @swagger
 * /api/v2/wallets/transactions/{transactionId}:
 *   get:
 *     summary: Get wallet transaction by ID
 *     tags: [V2 - Fiat Wallet]
 *     x-order: 0
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Transaction ID (UUID)
 *         example: "88811d6c-2484-497c-a25c-5f46bfc4ac04"
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Unauthorized
 */
walletRouter.get('/transactions/:transactionId', authenticateUser, getWalletTransactionByIdController);

export default walletRouter;

