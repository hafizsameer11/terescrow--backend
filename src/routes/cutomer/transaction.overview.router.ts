/**
 * Transaction Overview Routes (Customer)
 * 
 * Routes for transaction overview and chart data
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { getTransactionOverviewController } from '../../controllers/customer/transaction.overview.controller';
import { getRecentTransactionsController } from '../../controllers/customer/recent.transactions.controller';

const transactionOverviewRouter = express.Router();

/**
 * @swagger
 * /api/v2/transactions/recent:
 *   get:
 *     summary: Get recent transactions from all types
 *     tags: [V2 - Transactions]
 *     x-order: 0
 *     description: |
 *       Returns recent transactions from all types combined and sorted by date (most recent first):
 *       - Crypto transactions (BUY, SELL, SEND, RECEIVE, SWAP)
 *       - Bill Payment transactions
 *       - Gift Card orders
 *       - Fiat/Wallet transactions (DEPOSIT, WITHDRAWAL, TRANSFER, BILL_PAYMENT)
 *       
 *       **Response includes:**
 *       - Each transaction has a `type` field: CRYPTO, BILL_PAYMENT, GIFT_CARD, or FIAT
 *       - For crypto transactions, also includes `transactionType` (BUY, SELL, etc.)
 *       - Amounts in original currency, USD, and Naira (where applicable)
 *       - Transaction status and metadata
 *       - Pagination support
 *       
 *       **Transaction Types:**
 *       - `CRYPTO`: Crypto transactions (buy, sell, send, receive, swap)
 *       - `BILL_PAYMENT`: Bill payment transactions (airtime, data, betting)
 *       - `GIFT_CARD`: Gift card purchase orders
 *       - `FIAT`: Fiat wallet transactions (deposit, withdrawal, transfer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Number of transactions to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Recent transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Recent transactions retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Transaction ID (varies by type)
 *                             example: "BUY-1765357258830-12-vjd7f336e"
 *                           type:
 *                             type: string
 *                             enum: [CRYPTO, BILL_PAYMENT, GIFT_CARD, FIAT]
 *                             description: Transaction category type
 *                             example: "CRYPTO"
 *                           transactionType:
 *                             type: string
 *                             description: |
 *                               Sub-type of transaction (for crypto: BUY, SELL, SEND, RECEIVE, SWAP)
 *                               (for fiat: DEPOSIT, WITHDRAWAL, TRANSFER, BILL_PAYMENT)
 *                             example: "BUY"
 *                           status:
 *                             type: string
 *                             description: Transaction status
 *                             example: "successful"
 *                           amount:
 *                             type: string
 *                             description: Transaction amount in original currency
 *                             example: "0.001"
 *                           currency:
 *                             type: string
 *                             description: Currency code
 *                             example: "USDT_TRON"
 *                           amountUsd:
 *                             type: string
 *                             description: Amount in USD (if applicable)
 *                             example: "1.00"
 *                           amountNaira:
 *                             type: string
 *                             description: Amount in Naira (if applicable)
 *                             example: "1500.00"
 *                           description:
 *                             type: string
 *                             description: Human-readable transaction description
 *                             example: "Bought 0.001 USDT_TRON"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-10T09:00:58.838Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-10T09:00:58.838Z"
 *                           metadata:
 *                             type: object
 *                             description: Additional transaction-specific data
 *                             properties:
 *                               blockchain:
 *                                 type: string
 *                                 description: Blockchain (for crypto transactions)
 *                               symbol:
 *                                 type: string
 *                                 description: Currency symbol/icon path (for crypto)
 *                               sceneCode:
 *                                 type: string
 *                                 description: Scene code (for bill payments)
 *                               billerId:
 *                                 type: string
 *                                 description: Biller ID (for bill payments)
 *                               productId:
 *                                 type: integer
 *                                 description: Product ID (for gift cards)
 *                               provider:
 *                                 type: string
 *                                 description: Payment provider (for fiat transactions)
 *                     total:
 *                       type: integer
 *                       description: Total number of transactions (before pagination)
 *                       example: 150
 *                     limit:
 *                       type: integer
 *                       description: Number of transactions returned
 *                       example: 50
 *                     offset:
 *                       type: integer
 *                       description: Pagination offset
 *                       example: 0
 *       400:
 *         description: Bad request (invalid pagination parameters)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
transactionOverviewRouter.get('/recent', authenticateUser, getRecentTransactionsController);

/**
 * @swagger
 * /api/v2/transactions/overview:
 *   get:
 *     summary: Get transaction overview with chart data and history grouped by type
 *     tags: [V2 - Transactions]
 *     x-order: 1
 *     description: |
 *       Returns a comprehensive overview of all user transactions grouped by type:
 *       - Gift Card transactions
 *       - Crypto transactions
 *       - Bill Payment transactions
 *       - Naira (Fiat) transactions
 *       
 *       **Response includes:**
 *       - Chart data with percentages for each transaction type (for donut chart)
 *       - Transaction history grouped by type with totals in USD and NGN
 *       - Latest transaction date for each type
 *       - Transaction counts for each type
 *       
 *       **Chart Data:**
 *       - Total USD and NGN across all transaction types
 *       - Percentage breakdown for each type
 *       - Sorted by percentage (descending) for chart display
 *       
 *       **Transaction History:**
 *       - Each type shows total USD and NGN amounts
 *       - Latest transaction date
 *       - Transaction count
 *       - Icon identifier for UI display
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Transaction overview retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     chart:
 *                       type: object
 *                       properties:
 *                         totalUsd:
 *                           type: string
 *                           description: Total USD across all transaction types
 *                           example: "54368"
 *                         totalNgn:
 *                           type: string
 *                           description: Total NGN across all transaction types
 *                           example: "81150746"
 *                         types:
 *                           type: array
 *                           description: Transaction types sorted by percentage (for chart)
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "Crypto"
 *                               totalUsd:
 *                                 type: string
 *                                 example: "21200"
 *                               totalNgn:
 *                                 type: string
 *                                 example: "31641800"
 *                               percentage:
 *                                 type: number
 *                                 description: Percentage of total (0-100)
 *                                 example: 39.0
 *                               count:
 *                                 type: integer
 *                                 example: 45
 *                               latestDate:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-11-11T00:00:00.000Z"
 *                               icon:
 *                                 type: string
 *                                 example: "crypto"
 *                     history:
 *                       type: array
 *                       description: Transaction history grouped by type (original order)
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "Gift Card"
 *                           totalUsd:
 *                             type: string
 *                             example: "11234"
 *                           totalNgn:
 *                             type: string
 *                             example: "16761200"
 *                           percentage:
 *                             type: number
 *                             example: 20.7
 *                           count:
 *                             type: integer
 *                             example: 12
 *                           latestDate:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-11-11T00:00:00.000Z"
 *                           icon:
 *                             type: string
 *                             example: "gift-card"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
transactionOverviewRouter.get('/overview', authenticateUser, getTransactionOverviewController);

export default transactionOverviewRouter;

