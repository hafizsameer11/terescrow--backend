import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  queryReloadlyUtilityBillersController,
  queryReloadlyUtilityItemsController,
  verifyReloadlyUtilityAccountController,
  createReloadlyUtilityBillOrderController,
  queryReloadlyUtilityOrderStatusController,
  getReloadlyUtilityBillPaymentHistoryController,
} from '../../controllers/customer/billpayment.reloadly.utilities.controller';

const reloadlyUtilityBillPaymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bill Payments - Reloadly Utilities
 *   description: "Reloadly utility payments endpoints (Electricity, Water, TV, Internet)"
 */

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/billers:
 *   get:
 *     summary: Query Reloadly utility billers
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Get list of available Reloadly utility billers.
 *       Supports Electricity, Water, TV, and Internet bill payments across multiple countries.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ELECTRICITY_BILL_PAYMENT, WATER_BILL_PAYMENT, TV_BILL_PAYMENT, INTERNET_BILL_PAYMENT]
 *         description: Filter by utility type
 *       - in: query
 *         name: countryISOCode
 *         schema:
 *           type: string
 *         description: Filter by country ISO code (e.g., NG for Nigeria)
 *         example: "NG"
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: string
 *           enum: [PREPAID, POSTPAID]
 *         description: Filter by service type
 *     responses:
 *       200:
 *         description: Reloadly utility billers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider:
 *                   type: string
 *                   example: "reloadly"
 *                 billers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       billerId:
 *                         type: string
 *                         example: "1"
 *                         description: Reloadly biller ID (as string)
 *                       billerName:
 *                         type: string
 *                         example: "Ikeja Electricity Postpaid"
 *                       countryIsoCode:
 *                         type: string
 *                         example: "NG"
 *                       type:
 *                         type: string
 *                         enum: [ELECTRICITY_BILL_PAYMENT, WATER_BILL_PAYMENT, TV_BILL_PAYMENT, INTERNET_BILL_PAYMENT]
 *                       serviceType:
 *                         type: string
 *                         enum: [PREPAID, POSTPAID]
 *                       minAmount:
 *                         type: number
 *                         example: 1000
 *                       maxAmount:
 *                         type: number
 *                         example: 300000
 *                       currency:
 *                         type: string
 *                         example: "NGN"
 *                       localAmountSupported:
 *                         type: boolean
 *                       requiresInvoice:
 *                         type: boolean
 */
reloadlyUtilityBillPaymentRouter.get('/billers', authenticateUser, queryReloadlyUtilityBillersController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/items:
 *   get:
 *     summary: Query Reloadly utility items (biller info)
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Get biller information and limits for a specific utility biller.
 *       Note: Utilities use user-specified amounts, so items array is always empty.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: billerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Reloadly biller ID (number as string)
 *         example: "1"
 *     responses:
 *       200:
 *         description: Biller information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider:
 *                   type: string
 *                   example: "reloadly"
 *                 billerId:
 *                   type: string
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Always empty for utilities (user-specified amounts)
 *                 billerInfo:
 *                   type: object
 *                   properties:
 *                     billerName:
 *                       type: string
 *                     type:
 *                       type: string
 *                     serviceType:
 *                       type: string
 *                     minAmount:
 *                       type: number
 *                     maxAmount:
 *                       type: number
 *                     currency:
 *                       type: string
 */
reloadlyUtilityBillPaymentRouter.get('/items', authenticateUser, queryReloadlyUtilityItemsController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/verify-account:
 *   post:
 *     summary: Verify utility account number
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Verify utility account number and biller.
 *       Note: Reloadly doesn't provide account verification, so this performs basic validation.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rechargeAccount
 *               - billerId
 *             properties:
 *               rechargeAccount:
 *                 type: string
 *                 example: "04223568280"
 *                 description: Account/meter number
 *               billerId:
 *                 type: string
 *                 example: "1"
 *                 description: Reloadly biller ID (number as string)
 *     responses:
 *       200:
 *         description: Account verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 biller:
 *                   type: string
 *                 billerId:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     billerId:
 *                       type: number
 *                     billerName:
 *                       type: string
 *                     type:
 *                       type: string
 *                     serviceType:
 *                       type: string
 *                     countryIsoCode:
 *                       type: string
 */
reloadlyUtilityBillPaymentRouter.post('/verify-account', authenticateUser, verifyReloadlyUtilityAccountController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/create-order:
 *   post:
 *     summary: Create Reloadly utility payment order
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Create a real-time Reloadly utility payment order.
 *       
 *       **IMPORTANT**: This endpoint debits the user's wallet balance BEFORE creating the Reloadly order.
 *       If the Reloadly order creation fails, the wallet is automatically refunded.
 *       
 *       **PIN Required**: User must provide their 4-digit PIN for authorization.
 *       
 *       **Real-time Processing**: Reloadly processes utility payments in real-time. The response will indicate
 *       if the transaction was successful, processing, or failed immediately.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - billerId
 *               - rechargeAccount
 *               - amount
 *               - pin
 *             properties:
 *               billerId:
 *                 type: string
 *                 example: "1"
 *                 description: Reloadly biller ID (number as string)
 *               rechargeAccount:
 *                 type: string
 *                 example: "04223568280"
 *                 description: Account/meter number
 *               amount:
 *                 type: number
 *                 minimum: 1
 *                 example: 1000.00
 *                 description: Amount in local currency (must be within biller's min/max limits)
 *               pin:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "1234"
 *                 description: User's 4-digit PIN
 *     responses:
 *       200:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 billPaymentId:
 *                   type: string
 *                 transactionId:
 *                   type: string
 *                 orderNo:
 *                   type: string
 *                   description: Reloadly transaction ID
 *                 outOrderNo:
 *                   type: string
 *                   description: Custom identifier for this transaction
 *                 requestId:
 *                   type: string
 *                   description: Custom identifier for this transaction
 *                 sceneCode:
 *                   type: string
 *                   example: "electricity"
 *                 provider:
 *                   type: string
 *                   example: "reloadly"
 *                 billerId:
 *                   type: string
 *                 rechargeAccount:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                   example: "NGN"
 *                 orderStatus:
 *                   type: integer
 *                   description: "1 = processing, 2 = success, 3 = failed"
 *                 status:
 *                   type: string
 *                   enum: [pending, completed]
 *                 message:
 *                   type: string
 *                   example: "PROCESSING"
 *       400:
 *         description: Validation error, insufficient balance, or invalid PIN
 *       401:
 *         description: Invalid PIN
 */
reloadlyUtilityBillPaymentRouter.post('/create-order', authenticateUser, createReloadlyUtilityBillOrderController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/order-status:
 *   get:
 *     summary: Query Reloadly utility order status (with real-time update)
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Query the status of a Reloadly utility payment order.
 *       This endpoint queries both the database and Reloadly API for real-time status.
 *       If the status has changed, the database is automatically updated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: billPaymentId
 *         schema:
 *           type: string
 *         description: Bill payment ID (preferred method)
 *       - in: query
 *         name: transactionId
 *         schema:
 *           type: string
 *         description: Transaction ID (alternative to billPaymentId)
 *     responses:
 *       200:
 *         description: Order status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderStatus:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     orderNo:
 *                       type: string
 *                       description: Reloadly transaction ID
 *                     billerId:
 *                       type: string
 *                     orderStatus:
 *                       type: integer
 *                       description: "1 = processing, 2 = success, 3 = failed"
 *                     amount:
 *                       type: number
 *                     sceneCode:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     completedTime:
 *                       type: number
 *                       nullable: true
 *                 billPayment:
 *                   type: object
 *                   description: Full bill payment details from database
 *                 realtimeStatus:
 *                   type: object
 *                   nullable: true
 *                   description: Real-time status from Reloadly API (if available)
 *                   properties:
 *                     code:
 *                       type: string
 *                     message:
 *                       type: string
 *                     transaction:
 *                       type: object
 *       404:
 *         description: Bill payment not found
 */
reloadlyUtilityBillPaymentRouter.get('/order-status', authenticateUser, queryReloadlyUtilityOrderStatusController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/utilities/history:
 *   get:
 *     summary: Get Reloadly utility payment history
 *     tags: [V2 - Bill Payments - Reloadly Utilities]
 *     description: |
 *       **V2 API** - Get user's Reloadly utility payment transaction history with pagination and optional filters.
 *       Returns only Reloadly utility payments (electricity, water, TV, internet).
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: billerId
 *         schema:
 *           type: string
 *         description: Filter by biller ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by transaction status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ELECTRICITY_BILL_PAYMENT, WATER_BILL_PAYMENT, TV_BILL_PAYMENT, INTERNET_BILL_PAYMENT]
 *         description: Filter by utility type
 *     responses:
 *       200:
 *         description: Reloadly utility payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 billPayments:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
reloadlyUtilityBillPaymentRouter.get('/history', authenticateUser, getReloadlyUtilityBillPaymentHistoryController);

export default reloadlyUtilityBillPaymentRouter;

