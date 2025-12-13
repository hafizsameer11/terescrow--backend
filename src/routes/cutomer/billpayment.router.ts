import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  queryBillersController,
  queryItemsController,
  verifyAccountController,
  createBillOrderController,
  queryOrderStatusController,
  getBillPaymentHistoryController,
} from '../../controllers/customer/billpayment.controller';

const billPaymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bill Payments
 *   description: Bill payment endpoints (Airtime, Data, Betting) using PalmPay
 */

/**
 * @swagger
 * /api/v2/bill-payments/billers:
 *   get:
 *     summary: Query billers (operators) for a scene code
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get list of available operators (MTN, GLO, Airtel, etc.) for airtime, data, or betting.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *           Business scenario code. Examples: airtime, data, betting.
 *           Any scene code value is accepted.
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *     responses:
 *       200:
 *         description: Billers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
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
 *                         example: "MTN"
 *                       billerIcon:
 *                         type: string
 *                         example: "https://xxx/MTN.png"
 *                       minAmount:
 *                         type: number
 *                         example: 100
 *                       maxAmount:
 *                         type: number
 *                         example: 100000
 *                       status:
 *                         type: integer
 *                         example: 1
 */
billPaymentRouter.get('/billers', authenticateUser, queryBillersController);

/**
 * @swagger
 * /api/v2/bill-payments/items:
 *   get:
 *     summary: Query items (packages) for a biller
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get list of available packages/plans for a specific operator.
 *       Example: Get data plans for MTN.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *           Business scenario code. Examples: airtime, data, betting.
 *           Any scene code value is accepted.
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *       - in: query
 *         name: billerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Operator ID (e.g., "MTN", "GLO")
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                 billerId:
 *                   type: string
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       billerId:
 *                         type: string
 *                       itemId:
 *                         type: string
 *                       itemName:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       minAmount:
 *                         type: number
 *                       maxAmount:
 *                         type: number
 *                       isFixAmount:
 *                         type: integer
 *                         description: "0 = Non-fixed, 1 = Fixed"
 *                       status:
 *                         type: integer
 */
billPaymentRouter.get('/items', authenticateUser, queryItemsController);

/**
 * @swagger
 * /api/v2/bill-payments/verify-account:
 *   post:
 *     summary: Verify recharge account (phone number, meter number, etc.)
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Verify recipient account and get operator information.
 *       For betting, billerId and itemId are required.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sceneCode
 *               - rechargeAccount
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 description: |
 *                   Business scenario code. Examples: airtime, data, betting.
 *                   Any scene code value is accepted.
 *                 example: "airtime"
 *                 examples:
 *                   airtime:
 *                     value: airtime
 *                   data:
 *                     value: data
 *                   betting:
 *                     value: betting
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 15
 *                 example: "08154462953"
 *                 description: Phone number, meter number, or account number
 *               billerId:
 *                 type: string
 *                 description: Required for betting
 *                 example: "MTN"
 *               itemId:
 *                 type: string
 *                 description: Required for betting
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
 *                   example: "GLO"
 */
billPaymentRouter.post('/verify-account', authenticateUser, verifyAccountController);

/**
 * @swagger
 * /api/v2/bill-payments/create-order:
 *   post:
 *     summary: Create bill payment order
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Create a bill payment order (Airtime, Data, or Betting).
 *       
 *       **IMPORTANT**: This endpoint debits the user's wallet balance BEFORE creating the PalmPay order.
 *       If the PalmPay order creation fails, the wallet is automatically refunded.
 *       
 *       **PIN Required**: User must provide their 4-digit PIN for authorization.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sceneCode
 *               - billerId
 *               - itemId
 *               - rechargeAccount
 *               - amount
 *               - pin
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 description: |
 *                   Business scenario code. Examples: airtime, data, betting.
 *                   Any scene code value is accepted.
 *                 example: "airtime"
 *                 examples:
 *                   airtime:
 *                     value: airtime
 *                   data:
 *                     value: data
 *                   betting:
 *                     value: betting
 *               billerId:
 *                 type: string
 *                 example: "MTN"
 *               itemId:
 *                 type: string
 *                 example: "5267001812"
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 15
 *                 example: "08154462953"
 *               amount:
 *                 type: number
 *                 example: 1000.00
 *                 description: Amount in currency (e.g., 1000.00 NGN)
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
 *                 transactionId:
 *                   type: string
 *                 billPaymentId:
 *                   type: string
 *                 orderNo:
 *                   type: string
 *                   description: PalmPay platform order number
 *                 outOrderNo:
 *                   type: string
 *                   description: Merchant order number
 *                 sceneCode:
 *                   type: string
 *                 billerId:
 *                   type: string
 *                 itemId:
 *                   type: string
 *                 rechargeAccount:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         description: Validation error, insufficient balance, or invalid PIN
 *       401:
 *         description: Invalid PIN
 */
billPaymentRouter.post('/create-order', authenticateUser, createBillOrderController);

/**
 * @swagger
 * /api/v2/bill-payments/order-status:
 *   get:
 *     summary: Query bill payment order status
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Query the status of a bill payment order.
 *       Updates local transaction status based on PalmPay response.
 *       Can query by billPaymentId OR by sceneCode + orderNo/outOrderNo.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: billPaymentId
 *         schema:
 *           type: string
 *         description: Bill payment ID (preferred method)
 *       - in: query
 *         name: sceneCode
 *         schema:
 *           type: string
 *         description: |
 *           Business scenario code. Examples: airtime, data, betting.
 *           Any scene code value is accepted. Required if billPaymentId not provided.
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *       - in: query
 *         name: outOrderNo
 *         schema:
 *           type: string
 *         description: Merchant order number (required if billPaymentId not provided)
 *       - in: query
 *         name: orderNo
 *         schema:
 *           type: string
 *         description: PalmPay platform order number (required if billPaymentId not provided)
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
 *                     outOrderNo:
 *                       type: string
 *                     orderNo:
 *                       type: string
 *                     billerId:
 *                       type: string
 *                     itemId:
 *                       type: string
 *                     orderStatus:
 *                       type: integer
 *                     amount:
 *                       type: number
 *                     sceneCode:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     completedTime:
 *                       type: number
 *                 billPayment:
 *                   type: object
 *                   nullable: true
 */
billPaymentRouter.get('/order-status', authenticateUser, queryOrderStatusController);

/**
 * @swagger
 * /api/v2/bill-payments/history:
 *   get:
 *     summary: Get bill payment history
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get user's bill payment transaction history with pagination and optional filters.
 *       
 *       If no filters are provided, returns all bill payments for the user.
 *       All query parameters are optional - use them to filter the results.
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
 *         name: sceneCode
 *         required: false
 *         schema:
 *           type: string
 *         description: |
 *           (Optional) Business scenario code. Examples: airtime, data, betting.
 *           Any scene code value is accepted. If not provided, returns all scene codes.
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *       - in: query
 *         name: billerId
 *         required: false
 *         schema:
 *           type: string
 *         description: (Optional) Filter by biller ID (e.g., MTN, AIRTEL, GLO). If not provided, returns all billers.
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: (Optional) Filter by transaction status. If not provided, returns all statuses.
 *     responses:
 *       200:
 *         description: Bill payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
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
billPaymentRouter.get('/history', authenticateUser, getBillPaymentHistoryController);

export default billPaymentRouter;
