import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  initiateDepositController,
  checkDepositStatusController,
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
 *     summary: Initiate wallet deposit
 *     tags: [V2 - PalmPay Deposit]
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
 *                 description: Amount to deposit (in currency, e.g., 25000.00 NGN)
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *                 enum: [NGN, GHS, TZS, KES, ZAR]
 *     responses:
 *       200:
 *         description: Deposit initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionId:
 *                   type: string
 *                 checkoutUrl:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                 status:
 *                   type: string
 */
depositRouter.post(
  '/initiate',
  authenticateUser,
  initiateDepositController
);

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

