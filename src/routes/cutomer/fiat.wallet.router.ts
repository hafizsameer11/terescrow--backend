import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getWalletOverviewController,
  getWalletTransactionsController,
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

export default walletRouter;

