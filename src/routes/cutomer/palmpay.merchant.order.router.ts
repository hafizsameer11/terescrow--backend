/**
 * PalmPay Merchant Order Routes (Customer)
 * 
 * Routes for creating merchant orders with bank transfer
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { createMerchantOrderController } from '../../controllers/customer/palmpay.merchant.order.controller';
import { body } from 'express-validator';

const merchantOrderRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: V2 - PalmPay Merchant Order
 *   description: PalmPay merchant order creation with bank transfer endpoints
 */

/**
 * @swagger
 * /api/v2/payment/merchant/createorder:
 *   post:
 *     summary: Create merchant order with bank transfer
 *     tags: [V2 - PalmPay Merchant Order]
 *     x-order: 0
 *     description: |
 *       Creates a PalmPay merchant order with bank transfer payment method.
 *       When productType is "bank_transfer" and goodsId is -1, returns virtual account details including:
 *       - payerAccountType: -1 (bank transfer)
 *       - payerAccountId: Unique account ID
 *       - payerBankName: Bank name of virtual account
 *       - payerAccountName: Account name of virtual account
 *       - payerVirtualAccNo: Virtual account number
 *       
 *       **Note:** Minimum amount is 100.00 NGN (10,000 kobo)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - amount
 *               - currency
 *               - notifyUrl
 *               - callBackUrl
 *             properties:
 *               orderId:
 *                 type: string
 *                 maxLength: 32
 *                 description: Unique merchant order ID (max 32 characters)
 *                 example: "testc9ffae997fc1"
 *               title:
 *                 type: string
 *                 maxLength: 100
 *                 description: Order title
 *                 example: "Payment Order"
 *               description:
 *                 type: string
 *                 maxLength: 200
 *                 description: Order description
 *                 example: "Payment via bank transfer"
 *               userId:
 *                 type: string
 *                 maxLength: 50
 *                 description: Unique user ID on merchant
 *                 example: "110"
 *               userMobileNo:
 *                 type: string
 *                 maxLength: 15
 *                 description: |
 *                   User mobile phone number (displayed on cashier page).
 *                   Supports multiple formats: 07011698742, 7011698742, 023407011698742, 02347011698742
 *                 example: "07011698742"
 *               amount:
 *                 type: number
 *                 description: Transaction amount in NGN (minimum 100.00 NGN)
 *                 example: 200
 *               currency:
 *                 type: string
 *                 enum: [NGN]
 *                 default: NGN
 *                 description: Currency (currently only NGN supported)
 *                 example: "NGN"
 *               notifyUrl:
 *                 type: string
 *                 maxLength: 200
 *                 description: Webhook URL to receive transaction result notification
 *                 example: "https://your-domain.com/api/v2/webhooks/palmpay"
 *               callBackUrl:
 *                 type: string
 *                 maxLength: 200
 *                 description: Return URL after payment completion
 *                 example: "https://your-domain.com/payment/success"
 *               remark:
 *                 type: string
 *                 maxLength: 200
 *                 description: Remarks
 *                 example: "Order payment"
 *               goodsDetails:
 *                 type: string
 *                 description: |
 *                   JSONArray string format for product details.
 *                   For bank transfer, use: [{"goodsId": "-1"}]
 *                 example: '[{"goodsId": "-1"}]'
 *               productType:
 *                 type: string
 *                 enum: [bank_transfer]
 *                 default: bank_transfer
 *                 description: Fixed value "bank_transfer" for bank transfer payments
 *                 example: "bank_transfer"
 *     responses:
 *       200:
 *         description: Merchant order created successfully
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
 *                   example: "Merchant order created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderNo:
 *                       type: string
 *                       description: PalmPay platform Order No.
 *                       example: "2424220903032435363613"
 *                     orderStatus:
 *                       type: integer
 *                       description: Order status (1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED)
 *                       example: 1
 *                     message:
 *                       type: string
 *                       description: Status description
 *                       example: "success"
 *                     checkoutUrl:
 *                       type: string
 *                       description: H5 payment URL
 *                       example: "https://openapi.transspay.net/open-api/api/v1/payment/h5/redirect?orderNo=..."
 *                     payerAccountType:
 *                       type: string
 *                       description: Account type (pay with bank transfer -1)
 *                       example: "-1"
 *                     payerAccountId:
 *                       type: string
 *                       description: Unique account id (returned when -1)
 *                       example: "ACC123456"
 *                     payerBankName:
 *                       type: string
 *                       description: Bank name of virtual account (returned when -1)
 *                       example: "Access Bank"
 *                     payerAccountName:
 *                       type: string
 *                       description: Account name of virtual account (returned when -1)
 *                       example: "TERESCROW MERCHANT"
 *                     payerVirtualAccNo:
 *                       type: string
 *                       description: Virtual account number (returned when -1)
 *                       example: "1234567890"
 *                     sdkSessionId:
 *                       type: string
 *                       description: Parameters required to pull up the SDK using a secure dynamic key
 *                       example: "sdk_session_123456"
 *                     sdkSignKey:
 *                       type: string
 *                       description: Parameters required to pull up the SDK using a secure dynamic key
 *                       example: "sdk_sign_key_123456"
 *                     currency:
 *                       type: string
 *                       description: Currency (NGN)
 *                       example: "NGN"
 *                     orderAmount:
 *                       type: number
 *                       description: Transaction amount in kobo
 *                       example: 20000
 *                     payMethod:
 *                       type: string
 *                       description: Payment method
 *                       example: "bank_transfer"
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
merchantOrderRouter.post(
  '/createorder',
  authenticateUser,
  [
    body('orderId')
      .isString()
      .notEmpty()
      .isLength({ max: 32 })
      .withMessage('orderId is required and must be max 32 characters'),
    body('amount')
      .isNumeric()
      .withMessage('amount must be a number')
      .custom((value) => {
        const amountInCents = parseFloat(value) * 100;
        if (amountInCents < 10000) {
          throw new Error('Minimum amount is 100.00 NGN (10,000 kobo)');
        }
        return true;
      }),
    body('currency')
      .optional()
      .isString()
      .isIn(['NGN'])
      .withMessage('currency must be NGN'),
    body('notifyUrl')
      .isString()
      .isURL()
      .isLength({ max: 200 })
      .withMessage('notifyUrl must be a valid URL (max 200 characters)'),
    body('callBackUrl')
      .isString()
      .isURL()
      .isLength({ max: 200 })
      .withMessage('callBackUrl must be a valid URL (max 200 characters)'),
    body('title').optional().isString().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 200 }),
    body('userId').optional().isString().isLength({ max: 50 }),
    body('userMobileNo').optional().isString().isLength({ max: 15 }),
    body('remark').optional().isString().isLength({ max: 200 }),
    body('goodsDetails').optional().isString(),
    body('productType').optional().isString().isIn(['bank_transfer']),
  ],
  createMerchantOrderController
);

export default merchantOrderRouter;

