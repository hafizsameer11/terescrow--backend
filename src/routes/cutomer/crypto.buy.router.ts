/**
 * Crypto Buy Routes (Customer)
 * 
 * Routes for user crypto purchase operations
 * 
 * Flow Order:
 * 1. GET /buy/currencies - Get available currencies
 * 2. POST /buy/quote - Calculate quote (crypto amount → NGN cost)
 * 3. POST /buy/preview - Preview transaction with balances
 * 4. POST /buy - Execute purchase
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAvailableCurrenciesController,
  calculateBuyQuoteController,
  previewBuyController,
  buyCryptoController,
} from '../../controllers/customer/crypto.buy.controller';

const cryptoBuyRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/buy/currencies:
 *   get:
 *     summary: Get all available currencies for buying
 *     tags: [V2 - Crypto - Buy]
 *     x-order: 1
 *     description: |
 *       Returns a list of all supported cryptocurrencies that can be purchased.
 *       Includes currency details, prices, and blockchain information.
 *       
 *       **Use this to:**
 *       - Populate currency/blockchain selection dropdowns
 *       - Show available options to users
 *       - Display currency icons and names
 *       
 *       **Flow Step 1:** Start here to get available currencies
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available currencies retrieved successfully
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
 *                   example: "Available currencies retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     currencies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           currency:
 *                             type: string
 *                             example: "USDT_TRON"
 *                           blockchain:
 *                             type: string
 *                             example: "tron"
 *                           name:
 *                             type: string
 *                             example: "USDT TRON"
 *                           symbol:
 *                             type: string
 *                             example: "wallet_symbols/usdt.png"
 *                           price:
 *                             type: string
 *                             example: "1"
 *                           nairaPrice:
 *                             type: string
 *                           isToken:
 *                             type: boolean
 *                           tokenType:
 *                             type: string
 *                             nullable: true
 *                           blockchainName:
 *                             type: string
 *                             nullable: true
 *                           displayName:
 *                             type: string
 *                             example: "USDT_TRON"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoBuyRouter.get('/buy/currencies', authenticateUser, getAvailableCurrenciesController);

/**
 * @swagger
 * /api/v2/crypto/buy/quote:
 *   post:
 *     summary: Calculate buy quote (crypto amount → NGN cost)
 *     tags: [V2 - Crypto - Buy]
 *     x-order: 2
 *     description: |
 *       Calculates the NGN cost for a given crypto amount.
 *       This is a quick estimate endpoint that doesn't execute the purchase.
 *       
 *       **Rate Calculation:**
 *       1. Gets crypto price from wallet_currencies table
 *       2. Calculates USD value of crypto amount
 *       3. Gets USD to NGN rate from admin-configured rates (crypto_rates table, BUY type)
 *       4. Calculates: Crypto → USD → NGN cost
 *       
 *       **Use this to:**
 *       - Show users how much NGN they'll need to spend
 *       - Display rate information
 *       - Validate amounts
 *       
 *       **Flow Step 2:** After selecting currency, get quote
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
 *                 description: Amount in crypto currency (e.g., 15 for 15 USDT, 0.001 for 0.001 BTC)
 *                 example: 15
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to buy (e.g., BTC, ETH, USDT_TRON, USDC)
 *                 example: "USDT_TRON"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network (e.g., bitcoin, ethereum, bsc, tron)
 *                 example: "tron"
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
 *                     amountCrypto:
 *                       type: string
 *                       example: "15"
 *                     amountUsd:
 *                       type: string
 *                       example: "15"
 *                     amountNgn:
 *                       type: string
 *                       example: "22500"
 *                     rateUsdToCrypto:
 *                       type: string
 *                       description: Crypto price in USD
 *                       example: "1"
 *                     rateNgnToUsd:
 *                       type: string
 *                       description: USD to NGN rate (Naira per $1)
 *                       example: "1500"
 *                     currency:
 *                       type: string
 *                       example: "USDT_TRON"
 *                     blockchain:
 *                       type: string
 *                       example: "tron"
 *                     currencyName:
 *                       type: string
 *                       example: "USDT TRON"
 *                     currencySymbol:
 *                       type: string
 *                       example: "wallet_symbols/usdt.png"
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
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  previewBuyController
);

/**
 * @swagger
 * /api/v2/crypto/buy/preview:
 *   post:
 *     summary: Preview buy transaction (finalize step)
 *     tags: [V2 - Crypto - Buy]
 *     x-order: 3
 *     description: |
 *       Generates a complete preview of the buy transaction before execution.
 *       Shows current balances, projected balances after transaction, rates, and validation status.
 *       
 *       **Use this for:**
 *       - Final confirmation screen before executing the buy
 *       - Showing users exactly what will happen
 *       - Validating sufficient balance before proceeding
 *       
 *       **Flow Step 3:** Before executing, show preview
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
 *                 description: Amount in crypto currency to buy
 *                 example: 15
 *               currency:
 *                 type: string
 *                 example: "USDT_TRON"
 *               blockchain:
 *                 type: string
 *                 example: "tron"
 *     responses:
 *       200:
 *         description: Buy preview generated successfully
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
 *                   example: "Buy transaction preview generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     currency:
 *                       type: string
 *                     blockchain:
 *                       type: string
 *                     currencyName:
 *                       type: string
 *                     currencySymbol:
 *                       type: string
 *                     amountCrypto:
 *                       type: string
 *                     amountUsd:
 *                       type: string
 *                     amountNgn:
 *                       type: string
 *                     rateUsdToCrypto:
 *                       type: string
 *                     rateNgnToUsd:
 *                       type: string
 *                     fiatBalanceBefore:
 *                       type: string
 *                     cryptoBalanceBefore:
 *                       type: string
 *                     fiatBalanceAfter:
 *                       type: string
 *                     cryptoBalanceAfter:
 *                       type: string
 *                     hasSufficientBalance:
 *                       type: boolean
 *                     canProceed:
 *                       type: boolean
 *                     fiatWalletId:
 *                       type: string
 *                     virtualAccountId:
 *                       type: integer
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoBuyRouter.post(
  '/buy/preview',
  authenticateUser,
  [
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  previewBuyController
);

/**
 * @swagger
 * /api/v2/crypto/buy:
 *   post:
 *     summary: Execute crypto buy transaction
 *     tags: [V2 - Crypto - Buy]
 *     x-order: 4
 *     description: |
 *       Purchases cryptocurrency using NGN from user's fiat wallet.
 *       
 *       **Purchase Flow:**
 *       1. Validates crypto currency exists and gets price
 *       2. Calculates USD value of crypto amount
 *       3. Gets USD to NGN rate from admin rates (crypto_rates table, BUY type)
 *       4. Calculates NGN cost
 *       5. Validates user has sufficient NGN balance
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
 *       
 *       **Flow Step 4:** Execute the purchase
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
 *                 description: Amount in crypto currency to buy (e.g., 15 for 15 USDT, 0.001 for 0.001 BTC)
 *                 example: 15
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to buy (must exist in wallet_currencies)
 *                 example: "USDT_TRON"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "tron"
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
 *                     amountCrypto:
 *                       type: string
 *                       example: "15"
 *                     amountUsd:
 *                       type: string
 *                       example: "15"
 *                     amountNgn:
 *                       type: string
 *                       example: "22500"
 *                     rateUsdToCrypto:
 *                       type: string
 *                       example: "1"
 *                     rateNgnToUsd:
 *                       type: string
 *                       example: "1500"
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
    body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
  ],
  buyCryptoController
);

export default cryptoBuyRouter;
