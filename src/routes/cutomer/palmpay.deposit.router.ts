import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  checkDepositStatusController,
  depositSuccessController,
} from '../../controllers/customer/palmpay.deposit.controller';
import {
  getPermanentVirtualAccountController,
  createPermanentVirtualAccountController,
  refreshPermanentVirtualAccountController,
} from '../../controllers/customer/palmpay.permanent.va.controller';
import ApiError from '../../utils/ApiError';

const depositRouter = Router();

/** Legacy amount-based one-time VA — disabled for app funding. */
const deprecatedInitiateDeposit = (_req: any, _res: any, next: any) => {
  return next(
    ApiError.badRequest(
      'One-time bank transfer funding is no longer supported. Use your permanent funding account.'
    )
  );
};

depositRouter.get(
  '/virtual-account',
  authenticateUser,
  getPermanentVirtualAccountController
);
depositRouter.post(
  '/virtual-account',
  authenticateUser,
  createPermanentVirtualAccountController
);
depositRouter.post(
  '/virtual-account/refresh',
  authenticateUser,
  refreshPermanentVirtualAccountController
);

depositRouter.post(
  '/initiate',
  authenticateUser,
  deprecatedInitiateDeposit
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

