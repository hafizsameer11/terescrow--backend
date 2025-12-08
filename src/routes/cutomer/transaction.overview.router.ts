/**
 * Transaction Overview Routes (Customer)
 * 
 * Routes for transaction overview and chart data
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { getTransactionOverviewController } from '../../controllers/customer/transaction.overview.controller';

const transactionOverviewRouter = express.Router();

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

