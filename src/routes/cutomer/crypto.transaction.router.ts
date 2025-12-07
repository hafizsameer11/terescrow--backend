/**
 * Crypto Transaction Routes (Customer)
 * 
 * Routes for crypto transaction management
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getUserCryptoTransactionsController,
  getCryptoTransactionByIdController,
  getVirtualAccountTransactionsController,
} from '../../controllers/customer/crypto.transaction.controller';

const cryptoTransactionRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/transactions:
 *   get:
 *     summary: Get user's crypto transactions
 *     tags: [V2 - Crypto Transactions]
 *     description: |
 *       Get all crypto transactions for the authenticated user with optional filtering.
 *       If IS_MOCK_DATA=true and user has no transactions, returns mock data for frontend development.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [BUY, SELL, SEND, RECEIVE]
 *         description: Filter by transaction type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of transactions to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully. Returns mock data if IS_MOCK_DATA=true and user has no transactions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     isMockData:
 *                       type: boolean
 *                       description: Indicates if returned data is mock data
 *       401:
 *         description: Unauthorized
 */
cryptoTransactionRouter.get('/transactions', authenticateUser, getUserCryptoTransactionsController);

/**
 * @swagger
 * /api/v2/crypto/transactions/{transactionId}:
 *   get:
 *     summary: Get transaction by ID
 *     tags: [V2 - Crypto Transactions]
 *     description: Get detailed information about a specific crypto transaction
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *       404:
 *         description: Transaction not found
 */
cryptoTransactionRouter.get('/transactions/:transactionId', authenticateUser, getCryptoTransactionByIdController);

/**
 * @swagger
 * /api/v2/crypto/assets/{virtualAccountId}/transactions:
 *   get:
 *     summary: Get transactions for a virtual account
 *     tags: [V2 - Crypto Transactions]
 *     description: Get all transactions for a specific virtual account (asset)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: virtualAccountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Virtual account ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       404:
 *         description: Virtual account not found
 */
cryptoTransactionRouter.get('/assets/:virtualAccountId/transactions', authenticateUser, getVirtualAccountTransactionsController);

export default cryptoTransactionRouter;

