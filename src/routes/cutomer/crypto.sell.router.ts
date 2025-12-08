/**
 * Crypto Sell Routes (Customer)
 * 
 * Routes for user crypto sell operations
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  calculateSellQuoteController,
  previewSellController,
  getAvailableCurrenciesForSellController,
  sellCryptoController,
} from '../../controllers/customer/crypto.sell.controller';

const cryptoSellRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/sell/quote:
 *   post:
 *     summary: Calculate sell quote (preview before selling)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Calculates the estimated NGN amount you'll receive for selling a given crypto amount.
 *       This is a preview-only endpoint that doesn't execute the sale.
 *       
 *       **Rate Calculation:**
 *       1. Gets crypto price from wallet_currencies table
 *       2. Converts crypto to USD
 *       3. Gets USD to NGN rate from admin-configured rates (crypto_rates table, SELL type)
 *       4. Calculates: Crypto → USD → NGN amount
 *       
 *       **Use this to:**
 *       - Show users how much NGN they'll get before selling
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
 *                 description: Amount in crypto to sell (e.g., 0.001 for BTC)
 *                 example: 0.001
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to sell (e.g., BTC, ETH, USDT, USDC)
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
 *                   example: "Sell quote calculated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     amountCrypto:
 *                       type: string
 *                       example: "0.001"
 *                     amountUsd:
 *                       type: string
 *                       example: "104.12"
 *                     amountNgn:
 *                       type: string
 *                       example: "156180"
 *                     rateCryptoToUsd:
 *                       type: string
 *                       description: Crypto price in USD
 *                       example: "104120"
 *                     rateUsdToNgn:
 *                       type: string
 *                       description: USD to NGN rate (Naira per $1)
 *                       example: "1500"
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
cryptoSellRouter.post(
  '/sell/quote',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  calculateSellQuoteController
);

/**
 * @swagger
 * /api/v2/crypto/sell:
 *   post:
 *     summary: Sell cryptocurrency for fiat (NGN)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Sells cryptocurrency and receives NGN in user's fiat wallet.
 *       
 *       **Sell Flow:**
 *       1. Validates user has sufficient crypto balance in virtual account
 *       2. Gets crypto price from wallet_currencies table
 *       3. Converts crypto to USD
 *       4. Gets USD to NGN rate from admin rates (crypto_rates table, SELL type)
 *       5. Converts USD to NGN
 *       6. Debits crypto from virtual account
 *       7. Credits NGN to user's fiat wallet
 *       8. Creates transaction records (fiat transaction + crypto transaction)
 *       
 *       **Future Implementation (TODO):**
 *       - Check user's deposit address has sufficient on-chain balance
 *       - Estimate gas fees
 *       - Actually transfer crypto on blockchain (from user address to master wallet)
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
 *                 description: Amount in crypto to sell (must exist in user's virtual account)
 *                 example: 0.001
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to sell (must exist in wallet_currencies)
 *                 example: "BTC"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "bitcoin"
 *     responses:
 *       200:
 *         description: Cryptocurrency sold successfully
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
 *                   example: "Cryptocurrency sold successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       description: Unique transaction ID
 *                     amountCrypto:
 *                       type: string
 *                       example: "0.001"
 *                     amountUsd:
 *                       type: string
 *                       example: "104.12"
 *                     amountNgn:
 *                       type: string
 *                       example: "156180"
 *                     rateCryptoToUsd:
 *                       type: string
 *                       example: "104120"
 *                     rateUsdToNgn:
 *                       type: string
 *                       example: "1500"
 *                     fiatWalletId:
 *                       type: string
 *                     virtualAccountId:
 *                       type: integer
 *                     cryptoBalanceBefore:
 *                       type: string
 *                       description: Crypto balance before sale
 *                     cryptoBalanceAfter:
 *                       type: string
 *                       description: Crypto balance after sale
 *                     balanceBefore:
 *                       type: string
 *                       description: NGN balance before sale
 *                     balanceAfter:
 *                       type: string
 *                       description: NGN balance after sale
 *       400:
 *         description: Bad request (insufficient balance, invalid input, currency not supported)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Virtual account not found
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/v2/crypto/sell/currencies:
 *   get:
 *     summary: Get available currencies for selling (user must have balance > 0)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Returns a list of cryptocurrencies the user can sell (only currencies with balance > 0).
 *       Includes current balance, currency details, prices, and blockchain information.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available currencies for selling retrieved successfully
 */
cryptoSellRouter.get('/sell/currencies', authenticateUser, getAvailableCurrenciesForSellController);

/**
 * @swagger
 * /api/v2/crypto/sell/preview:
 *   post:
 *     summary: Preview sell transaction (finalize step)
 *     tags: [V2 - Crypto]
 *     description: |
 *       Generates a complete preview of the sell transaction before execution.
 *       Shows current balances, projected balances after transaction, rates, and validation status.
 *     security:
 *       - bearerAuth: []
 */
cryptoSellRouter.post(
  '/sell/preview',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  previewSellController
);

cryptoSellRouter.post(
  '/sell',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  sellCryptoController
);

export default cryptoSellRouter;

