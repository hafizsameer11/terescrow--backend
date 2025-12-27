import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  queryVtpassBillersController,
  queryVtpassItemsController,
  verifyVtpassAccountController,
  createVtpassBillOrderController,
  queryVtpassOrderStatusController,
  getVtpassBillPaymentHistoryController,
} from '../../controllers/customer/billpayment.vtpass.controller';

const vtpassBillPaymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bill Payments - VTpass
 *   description: VTpass bill payment endpoints (Airtime, Data, Cable, Electricity, Education)
 */

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/billers:
 *   get:
 *     summary: Query VTpass billers (operators) for a scene code
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Get list of available VTpass operators for airtime, data, cable, electricity, or education.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [airtime, data, cable, electricity, education]
 *         description: |
 *           Business scenario code. Supported values: airtime, data, cable, electricity, education.
 *     responses:
 *       200:
 *         description: VTpass billers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                 provider:
 *                   type: string
 *                   example: "vtpass"
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
 *                       serviceID:
 *                         type: string
 *                         example: "mtn"
 */
vtpassBillPaymentRouter.get('/billers', authenticateUser, queryVtpassBillersController);

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/items:
 *   get:
 *     summary: Query VTpass items (packages/plans) for a biller
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Get list of available packages/plans for a specific VTpass operator.
 *       Example: Get data plans for MTN, cable bouquets for DSTV, etc.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [airtime, data, cable, electricity, education]
 *         description: Business scenario code
 *       - in: query
 *         name: billerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Operator ID (e.g., "MTN", "GLO", "DSTV", "IKEDC", "JAMB")
 *     responses:
 *       200:
 *         description: VTpass items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                 provider:
 *                   type: string
 *                   example: "vtpass"
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
 *                         description: Variation code (for data/cable/electricity/education). Empty for airtime.
 *                       itemName:
 *                         type: string
 *                         description: Plan/bouquet name
 *                       amount:
 *                         type: number
 *                         description: Price in NGN (0 for user-specified amounts like airtime/electricity)
 *                       serviceID:
 *                         type: string
 */
vtpassBillPaymentRouter.get('/items', authenticateUser, queryVtpassItemsController);

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/verify-account:
 *   post:
 *     summary: Verify VTpass recharge account (phone/meter/smartcard/profile)
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Verify recipient account and get operator/customer information.
 *       - For electricity, itemId (meterType: "prepaid" or "postpaid") is required.
 *       - For cable, verifies smartcard number.
 *       - For education JAMB, verifies profile ID.
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
 *               - billerId
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 enum: [airtime, data, cable, electricity, education]
 *                 description: Business scenario code
 *                 example: "airtime"
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 50
 *                 example: "08154462953"
 *                 description: Phone number, meter number, smartcard number, or profile ID
 *               billerId:
 *                 type: string
 *                 example: "MTN"
 *                 description: Operator ID (required for verification)
 *               itemId:
 *                 type: string
 *                 description: Required for electricity (must be "prepaid" or "postpaid"). Optional for JAMB verification.
 *                 example: "prepaid"
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
 *                   example: "MTN"
 *                 result:
 *                   type: object
 *                   description: Additional verification details (customer name, meter type, etc.)
 */
vtpassBillPaymentRouter.post('/verify-account', authenticateUser, verifyVtpassAccountController);

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/create-order:
 *   post:
 *     summary: Create VTpass bill payment order
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Create a VTpass bill payment order (Airtime, Data, Cable, Electricity, or Education).
 *       
 *       **IMPORTANT**: This endpoint debits the user's wallet balance BEFORE creating the VTpass order.
 *       If the VTpass order creation fails, the wallet is automatically refunded.
 *       
 *       **PIN Required**: User must provide their 4-digit PIN for authorization.
 *       
 *       **VTpass Requirements**: 
 *       - `phone` field is required for all VTpass services
 *       - For airtime, `itemId` is optional
 *       - For electricity, `itemId` must be "prepaid" or "postpaid"
 *       - For data/cable/education, `itemId` (variation_code) is required
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
 *               - rechargeAccount
 *               - amount
 *               - phone
 *               - pin
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 enum: [airtime, data, cable, electricity, education]
 *                 description: Business scenario code
 *                 example: "airtime"
 *               billerId:
 *                 type: string
 *                 example: "MTN"
 *               itemId:
 *                 type: string
 *                 example: "mtn-1gb"
 *                 description: Variation code (optional for airtime, required for others). For electricity, must be "prepaid" or "postpaid"
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 50
 *                 example: "08154462953"
 *                 description: Phone number, meter number, smartcard number, or profile ID
 *               phone:
 *                 type: string
 *                 example: "08011111111"
 *                 description: Customer phone number (required for VTpass)
 *               amount:
 *                 type: number
 *                 example: 1000.00
 *                 description: Amount in NGN
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
 *                   description: VTpass transaction ID
 *                 requestId:
 *                   type: string
 *                   description: VTpass request ID
 *                 sceneCode:
 *                   type: string
 *                 provider:
 *                   type: string
 *                   example: "vtpass"
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
 *                 orderStatus:
 *                   type: integer
 *                   description: "1 = pending, 2 = success, 3 = failed"
 *                 status:
 *                   type: string
 *                   enum: [pending, completed]
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error, insufficient balance, or invalid PIN
 *       401:
 *         description: Invalid PIN
 */
vtpassBillPaymentRouter.post('/create-order', authenticateUser, createVtpassBillOrderController);

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/order-status:
 *   get:
 *     summary: Query VTpass bill payment order status
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Query the status of a VTpass bill payment order from the database.
 *       Returns the current status stored in our database.
 *       Can query by billPaymentId OR by sceneCode + requestId/orderNo.
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
 *           enum: [airtime, data, cable, electricity, education]
 *         description: Business scenario code (required if billPaymentId not provided)
 *       - in: query
 *         name: requestId
 *         schema:
 *           type: string
 *         description: VTpass request ID (required if billPaymentId not provided)
 *       - in: query
 *         name: orderNo
 *         schema:
 *           type: string
 *         description: VTpass transaction ID (required if billPaymentId not provided)
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
 *                       description: VTpass request ID
 *                     orderNo:
 *                       type: string
 *                       description: VTpass transaction ID
 *                     billerId:
 *                       type: string
 *                     itemId:
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
 *                     errorMsg:
 *                       type: string
 *                       nullable: true
 *                 billPayment:
 *                   type: object
 *                   description: Full bill payment details from database
 */
vtpassBillPaymentRouter.get('/order-status', authenticateUser, queryVtpassOrderStatusController);

/**
 * @swagger
 * /api/v2/bill-payments/vtpass/history:
 *   get:
 *     summary: Get VTpass bill payment history
 *     tags: [V2 - Bill Payments - VTpass]
 *     description: |
 *       **V2 API** - Get user's VTpass bill payment transaction history with pagination and optional filters.
 *       
 *       Returns only VTpass payments. All query parameters are optional.
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
 *           enum: [airtime, data, cable, electricity, education]
 *         description: Filter by scene code
 *       - in: query
 *         name: billerId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by biller ID (e.g., MTN, DSTV, IKEDC)
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by transaction status
 *     responses:
 *       200:
 *         description: VTpass bill payment history retrieved successfully
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
vtpassBillPaymentRouter.get('/history', authenticateUser, getVtpassBillPaymentHistoryController);

export default vtpassBillPaymentRouter;

