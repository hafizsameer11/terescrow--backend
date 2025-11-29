/**
 * Virtual Account Routes (Customer)
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getUserVirtualAccountsController,
  getDepositAddressController,
} from '../../controllers/customer/virtual.account.controller';

const virtualAccountRouter = express.Router();

/**
 * @swagger
 * /api/v2/wallets/virtual-accounts:
 *   get:
 *     summary: Get user's virtual accounts
 *     tags: [V2 - Virtual Accounts]
 *     description: Get all virtual accounts for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Virtual accounts retrieved successfully
 */
virtualAccountRouter.get('/virtual-accounts', authenticateUser, getUserVirtualAccountsController);

/**
 * @swagger
 * /api/v2/wallets/deposit-address/{currency}/{blockchain}:
 *   get:
 *     summary: Get deposit address for a currency
 *     tags: [V2 - Virtual Accounts]
 *     description: Get deposit address for a specific currency and blockchain
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         example: "BTC"
 *       - in: path
 *         name: blockchain
 *         required: true
 *         schema:
 *           type: string
 *         example: "bitcoin"
 *     responses:
 *       200:
 *         description: Deposit address retrieved successfully
 */
virtualAccountRouter.get(
  '/deposit-address/:currency/:blockchain',
  authenticateUser,
  getDepositAddressController
);

export default virtualAccountRouter;

