import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getBankListController,
  verifyBankAccountController,
  initiatePayoutController,
  checkPayoutStatusController,
} from '../../controllers/customer/palmpay.payout.controller';

const payoutRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - PalmPay Payout
 *   description: PalmPay withdrawal (payout) endpoints
 */

/**
 * @swagger
 * /api/v2/payments/palmpay/banks:
 *   get:
 *     summary: Get bank list
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 1
 *     description: |
 *       **Flow Step 1:** Get list of supported banks for payout.
 *       Use this to populate bank selection dropdown.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessType
 *         schema:
 *           type: integer
 *           default: 0
 *           description: 0 = all banks
 *     responses:
 *       200:
 *         description: Bank list retrieved successfully
 */
payoutRouter.get('/banks', authenticateUser, getBankListController);

/**
 * @swagger
 * /api/v2/payments/palmpay/verify-account:
 *   post:
 *     summary: Verify bank account
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 2
 *     description: |
 *       **Flow Step 2:** Verify bank account details before initiating payout.
 *       Validates account number and bank code, returns account name.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankCode
 *               - accountNumber
 *             properties:
 *               bankCode:
 *                 type: string
 *                 example: "100033"
 *               accountNumber:
 *                 type: string
 *                 example: "023408844440004"
 *     responses:
 *       200:
 *         description: Account verified successfully
 */
payoutRouter.post('/verify-account', authenticateUser, verifyBankAccountController);

/**
 * @swagger
 * /api/v2/payments/palmpay/payout/initiate:
 *   post:
 *     summary: Initiate payout (withdrawal)
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 3
 *     description: |
 *       **Flow Step 3:** Initiate bank transfer payout after verifying account.
 *       Transfers NGN from user's fiat wallet to their bank account.
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
 *               - bankCode
 *               - accountNumber
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 10000.00
 *               currency:
 *                 type: string
 *                 default: NGN
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payout initiated successfully
 */
payoutRouter.post('/payout/initiate', authenticateUser, initiatePayoutController);

/**
 * @swagger
 * /api/v2/payments/palmpay/payout/{transactionId}:
 *   get:
 *     summary: Check payout status
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 4
 *     description: |
 *       **Flow Step 4:** Check the status of a payout transaction.
 *       Use this to poll for transaction updates or check completion status.
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
 *         description: Payout status retrieved
 */
payoutRouter.get('/payout/:transactionId', authenticateUser, checkPayoutStatusController);

export default payoutRouter;

