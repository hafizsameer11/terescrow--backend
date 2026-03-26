import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  initiateDepositController,
  checkDepositStatusController,
  depositSuccessController,
} from '../../controllers/customer/palmpay.deposit.controller';

const depositRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - PalmPay Deposit
 *   description: PalmPay wallet deposit (top-up) endpoints
 */

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/initiate:
 *   post:
 *     summary: Initiate wallet deposit via bank transfer
 *     tags: [V2 - PalmPay Deposit]
 *     description: |
 *       Initiates a wallet deposit using PalmPay bank transfer.
 *       Returns virtual account details for the user to transfer funds to.
 *       **Minimum amount:** 100.00 NGN (10,000 kobo)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *                 description: Amount to deposit in NGN (minimum 100.00 NGN)
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *                 enum: [NGN]
 *                 description: Currency (currently only NGN is supported for bank transfer)
 *     responses:
 *       200:
 *         description: Deposit initiated successfully. Virtual account details provided.
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
 *                   example: "Deposit initiated successfully. Please transfer to the provided virtual account."
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       description: Internal transaction ID
 *                       example: "uuid-123-456"
 *                     merchantOrderId:
 *                       type: string
 *                       description: Merchant order ID
 *                       example: "deposit_abc123def456"
 *                     orderNo:
 *                       type: string
 *                       description: PalmPay platform order number
 *                       example: "2424220903032435363613"
 *                     amount:
 *                       type: number
 *                       description: Deposit amount
 *                       example: 25000.00
 *                     currency:
 *                       type: string
 *                       description: Currency code
 *                       example: "NGN"
 *                     status:
 *                       type: string
 *                       description: Transaction status
 *                       example: "pending"
 *                     virtualAccount:
 *                       type: object
 *                       description: Virtual account details for bank transfer
 *                       properties:
 *                         accountType:
 *                           type: string
 *                           description: Account type (-1 for bank transfer)
 *                           example: "-1"
 *                         accountId:
 *                           type: string
 *                           description: Unique account ID
 *                           example: "ACC123456"
 *                         bankName:
 *                           type: string
 *                           description: Bank name of virtual account
 *                           example: "Access Bank"
 *                         accountName:
 *                           type: string
 *                           description: Account name of virtual account
 *                           example: "TERESCROW MERCHANT"
 *                         accountNumber:
 *                           type: string
 *                           description: Virtual account number to transfer funds to
 *                           example: "1234567890"
 *                     checkoutUrl:
 *                       type: string
 *                       description: H5 payment URL (alternative payment method)
 *                       example: "https://openapi.transspay.net/open-api/api/v1/payment/h5/redirect?orderNo=..."
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
depositRouter.post(
  '/initiate',
  authenticateUser,
  initiateDepositController
);

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/success:
 *   get:
 *     summary: Deposit success callback
 *     tags: [V2 - PalmPay Deposit]
 *     description: |
 *       **Callback URL:** This is the URL that PalmPay redirects users to after successful payment.
 *       Returns a success message in JSON format.
 *       This endpoint does not require authentication as it's a public callback.
 *     responses:
 *       200:
 *         description: Deposit success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Deposit completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "Your deposit has been processed successfully. Your wallet will be credited shortly."
 */
depositRouter.get('/success', depositSuccessController);

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/{transactionId}:
 *   get:
 *     summary: Check deposit status
 *     tags: [V2 - PalmPay Deposit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deposit status retrieved
 */
depositRouter.get(
  '/:transactionId',
  authenticateUser,
  checkDepositStatusController
);

export default depositRouter;

