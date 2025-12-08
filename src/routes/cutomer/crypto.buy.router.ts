/**
 * Crypto Buy Routes (Customer)
 * 
 * Routes for user crypto purchase operations
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  calculateBuyQuoteController,
  previewBuyController,
  getAvailableCurrenciesController,
  buyCryptoController,
} from '../../controllers/customer/crypto.buy.controller';

const cryptoBuyRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/buy/quote:
 *   post:
 *     summary: Calculate buy quote (preview before purchase)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Calculates the estimated crypto amount you'll receive for a given NGN amount.
 *       This is a preview-only endpoint that doesn't execute the purchase.
 *       
 *       **Rate Calculation:**
 *       1. Gets NGN to USD rate from admin-configured rates (crypto_rates table, BUY type)
 *       2. Gets crypto price from wallet_currencies table
 *       3. Calculates: NGN → USD → Crypto amount
 *       
 *       **Use this to:**
 *       - Show users how much crypto they'll get before purchasing
 *       - Display rate information
 *       - Validate amounts
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
 *               - currency
 *               - blockchain
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in NGN (Naira) to spend
 *                 example: 15000
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to buy (e.g., BTC, ETH, USDT, USDC)
 *                 example: "BTC"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network (e.g., bitcoin, ethereum, bsc, tron)
 *                 example: "bitcoin"
 *     responses:
 *       200:
 *         description: Quote calculated successfully
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
 *                   example: "Buy quote calculated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     amountNgn:
 *                       type: string
 *                       example: "15000"
 *                     amountUsd:
 *                       type: string
 *                       example: "10"
 *                     amountCrypto:
 *                       type: string
 *                       example: "0.000096"
 *                     rateNgnToUsd:
 *                       type: string
 *                       description: NGN to USD rate (Naira per $1)
 *                       example: "1500"
 *                     rateUsdToCrypto:
 *                       type: string
 *                       description: Crypto price in USD
 *                       example: "104120"
 *                     currency:
 *                       type: string
 *                       example: "BTC"
 *                     blockchain:
 *                       type: string
 *                       example: "bitcoin"
 *                     currencyName:
 *                       type: string
 *                       example: "BTC"
 *                     currencySymbol:
 *                       type: string
 *                       example: "wallet_symbols/btc.png"
 *       400:
 *         description: Bad request (invalid input or currency not supported)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoBuyRouter.post(
  '/buy/quote',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  calculateBuyQuoteController
);

/**
 * @swagger
 * /api/v2/crypto/buy:
 *   post:
 *     summary: Buy cryptocurrency with fiat (NGN)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Purchases cryptocurrency using NGN from user's fiat wallet.
 *       
 *       **Purchase Flow:**
 *       1. Validates user has sufficient NGN balance in fiat wallet
 *       2. Gets NGN to USD rate from admin rates (crypto_rates table, BUY type)
 *       3. Converts NGN to USD
 *       4. Gets crypto price from wallet_currencies table
 *       5. Calculates crypto amount to receive
 *       6. Debits NGN from fiat wallet
 *       7. Credits crypto to user's virtual account
 *       8. Creates transaction records (fiat transaction + crypto transaction)
 *       
 *       **Future Implementation (TODO):**
 *       - Check master wallet has sufficient balance
 *       - Estimate gas fees
 *       - Actually transfer crypto on blockchain
 *       - Keep detailed blockchain transaction records
 *       
 *       **Note:** Currently, this is an internal ledger operation. 
 *       The actual blockchain transfer will be implemented later.
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
 *               - currency
 *               - blockchain
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in NGN (Naira) to spend
 *                 example: 15000
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to buy (must exist in wallet_currencies)
 *                 example: "BTC"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "bitcoin"
 *     responses:
 *       200:
 *         description: Cryptocurrency purchased successfully
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
 *                   example: "Cryptocurrency purchased successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       description: Unique transaction ID
 *                     amountNgn:
 *                       type: string
 *                       example: "15000"
 *                     amountUsd:
 *                       type: string
 *                       example: "10"
 *                     amountCrypto:
 *                       type: string
 *                       example: "0.000096"
 *                     rateNgnToUsd:
 *                       type: string
 *                       example: "1500"
 *                     rateUsdToCrypto:
 *                       type: string
 *                       example: "104120"
 *                     fiatWalletId:
 *                       type: string
 *                     virtualAccountId:
 *                       type: integer
 *                     balanceBefore:
 *                       type: string
 *                       description: NGN balance before purchase
 *                     balanceAfter:
 *                       type: string
 *                       description: NGN balance after purchase
 *                     cryptoBalanceBefore:
 *                       type: string
 *                       description: Crypto balance before purchase
 *                     cryptoBalanceAfter:
 *                       type: string
 *                       description: Crypto balance after purchase
 *       400:
 *         description: Bad request (insufficient balance, invalid input, currency not supported)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Virtual account not found
 *       500:
 *         description: Server error
 */
cryptoBuyRouter.post(
  '/buy',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  buyCryptoController
);

export default cryptoBuyRouter;

