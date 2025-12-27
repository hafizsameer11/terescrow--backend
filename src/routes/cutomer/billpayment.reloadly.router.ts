import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  queryReloadlyBillersController,
  queryReloadlyItemsController,
  verifyReloadlyAccountController,
  createReloadlyBillOrderController,
  queryReloadlyOrderStatusController,
  getReloadlyBillPaymentHistoryController,
} from '../../controllers/customer/billpayment.reloadly.controller';

const reloadlyBillPaymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bill Payments - Reloadly
 *   description: "Reloadly airtime top-up endpoints (Nigeria operators: MTN, GLO, Airtel, 9mobile)"
 */

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/billers:
 *   get:
 *     summary: Query Reloadly airtime operators (billers)
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Get list of available Reloadly airtime operators for Nigeria.
 *       Returns MTN, GLO, Airtel, and 9mobile with their operator IDs and limits.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reloadly operators retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                   example: "airtime"
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
 *                         example: "MTN"
 *                       billerName:
 *                         type: string
 *                         example: "MTN Nigeria"
 *                       operatorId:
 *                         type: integer
 *                         example: 341
 *                       minAmount:
 *                         type: number
 *                         example: 50
 *                       maxAmount:
 *                         type: number
 *                         example: 10000
 *                       denominationType:
 *                         type: string
 *                         enum: [RANGE, FIXED]
 *                         example: "RANGE"
 *                       country:
 *                         type: object
 *                         properties:
 *                           isoName:
 *                             type: string
 *                             example: "NG"
 *                           name:
 *                             type: string
 *                             example: "Nigeria"
 */
reloadlyBillPaymentRouter.get('/billers', authenticateUser, queryReloadlyBillersController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/items:
 *   get:
 *     summary: Query Reloadly items (operator info)
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Get operator information and limits for a specific biller.
 *       Note: Airtime uses user-specified amounts, so items array is always empty.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: billerId
 *         required: true
 *         schema:
 *           type: string
 *           enum: [MTN, GLO, AIRTEL, 9MOBILE]
 *         description: Operator ID (MTN, GLO, AIRTEL, or 9MOBILE)
 *     responses:
 *       200:
 *         description: Operator information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                   example: "airtime"
 *                 provider:
 *                   type: string
 *                   example: "reloadly"
 *                 billerId:
 *                   type: string
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Always empty for airtime (user-specified amounts)
 *                 operatorInfo:
 *                   type: object
 *                   properties:
 *                     operatorId:
 *                       type: integer
 *                     minAmount:
 *                       type: number
 *                     maxAmount:
 *                       type: number
 *                     denominationType:
 *                       type: string
 */
reloadlyBillPaymentRouter.get('/items', authenticateUser, queryReloadlyItemsController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/verify-account:
 *   post:
 *     summary: Verify phone number and auto-detect operator
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Verify phone number and automatically detect the operator.
 *       Uses Reloadly's auto-detect feature to identify the network operator.
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
 *             properties:
 *               rechargeAccount:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08154462953"
 *                 description: Phone number (must start with 0 and be 11 digits)
 *               billerId:
 *                 type: string
 *                 enum: [MTN, GLO, AIRTEL, 9MOBILE]
 *                 description: Optional - if provided, verifies it matches detected operator
 *                 example: "MTN"
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
 *                   example: "MTN Nigeria"
 *                 billerId:
 *                   type: string
 *                   example: "MTN"
 *                 result:
 *                   type: object
 *                   properties:
 *                     operatorId:
 *                       type: integer
 *                     operatorName:
 *                       type: string
 *                     country:
 *                       type: object
 *                     minAmount:
 *                       type: number
 *                     maxAmount:
 *                       type: number
 */
reloadlyBillPaymentRouter.post('/verify-account', authenticateUser, verifyReloadlyAccountController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/create-order:
 *   post:
 *     summary: Create Reloadly airtime top-up order
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Create a real-time Reloadly airtime top-up order.
 *       
 *       **IMPORTANT**: This endpoint debits the user's wallet balance BEFORE creating the Reloadly order.
 *       If the Reloadly order creation fails, the wallet is automatically refunded.
 *       
 *       **PIN Required**: User must provide their 4-digit PIN for authorization.
 *       
 *       **Real-time Processing**: Reloadly processes top-ups in real-time. The response will indicate
 *       if the transaction was successful, pending, or failed immediately.
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
 *                 enum: [MTN, GLO, AIRTEL, 9MOBILE]
 *                 example: "MTN"
 *                 description: Operator ID
 *               rechargeAccount:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08154462953"
 *                 description: Phone number to recharge (must start with 0 and be 11 digits)
 *               amount:
 *                 type: number
 *                 minimum: 50
 *                 maximum: 10000
 *                 example: 500.00
 *                 description: Amount in NGN (must be within operator's min/max limits)
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
 *                 requestId:
 *                   type: string
 *                   description: Custom identifier for this transaction
 *                 sceneCode:
 *                   type: string
 *                   example: "airtime"
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
 *                   description: "1 = pending, 2 = success, 3 = failed"
 *                 status:
 *                   type: string
 *                   enum: [pending, completed]
 *                 message:
 *                   type: string
 *                   example: "SUCCESSFUL"
 *                 reloadlyResponse:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [SUCCESSFUL, PENDING, FAILED, REFUNDED]
 *                     operatorTransactionId:
 *                       type: string
 *                     deliveredAmount:
 *                       type: number
 *                     deliveredAmountCurrencyCode:
 *                       type: string
 *                     discount:
 *                       type: number
 *       400:
 *         description: Validation error, insufficient balance, or invalid PIN
 *       401:
 *         description: Invalid PIN
 */
reloadlyBillPaymentRouter.post('/create-order', authenticateUser, createReloadlyBillOrderController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/order-status:
 *   get:
 *     summary: Query Reloadly order status (with real-time update)
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Query the status of a Reloadly airtime order.
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
 *                       description: "1 = pending, 2 = success, 3 = failed"
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
 *                     status:
 *                       type: string
 *                       enum: [SUCCESSFUL, PENDING, FAILED, REFUNDED]
 *                     transaction:
 *                       type: object
 *       404:
 *         description: Bill payment not found
 */
reloadlyBillPaymentRouter.get('/order-status', authenticateUser, queryReloadlyOrderStatusController);

/**
 * @swagger
 * /api/v2/bill-payments/reloadly/history:
 *   get:
 *     summary: Get Reloadly airtime payment history
 *     tags: [V2 - Bill Payments - Reloadly]
 *     description: |
 *       **V2 API** - Get user's Reloadly airtime transaction history with pagination and optional filters.
 *       Returns only Reloadly airtime payments.
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
 *         required: false
 *         schema:
 *           type: string
 *           enum: [MTN, GLO, AIRTEL, 9MOBILE]
 *         description: Filter by operator
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by transaction status
 *     responses:
 *       200:
 *         description: Reloadly payment history retrieved successfully
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
reloadlyBillPaymentRouter.get('/history', authenticateUser, getReloadlyBillPaymentHistoryController);

export default reloadlyBillPaymentRouter;

