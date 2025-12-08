/**
 * Crypto Sell Routes (Customer)
 * 
 * Routes for user crypto sell operations
 * 
 * Flow Order:
 * 1. GET /sell/currencies - Get available currencies
 * 2. POST /sell/quote - Calculate quote (crypto amount → NGN)
 * 3. POST /sell/preview - Preview transaction with balances
 * 4. POST /sell - Execute sale
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAvailableCurrenciesForSellController,
  calculateSellQuoteController,
  previewSellController,
  sellCryptoController,
} from '../../controllers/customer/crypto.sell.controller';

const cryptoSellRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/sell/currencies:
 *   get:
 *     summary: Get available currencies for selling (user must have balance > 0)
 *     tags: [V2 - Crypto - Sell]
 *     x-order: 1
 *     description: |
 *       Returns a list of cryptocurrencies the user can sell (only currencies with balance > 0).
 *       Includes current balance, currency details, prices, and blockchain information.
 *       
 *       **Use this to:**
 *       - Populate currency/blockchain selection dropdowns for selling
 *       - Show only currencies user actually owns
 *       - Display current balances for each currency
 *       
 *       **Flow Step 1:** Start here to get available currencies to sell
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available currencies for selling retrieved successfully
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
 *                   example: "Available currencies for selling retrieved successfully"
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
 *                             example: "BTC"
 *                           blockchain:
 *                             type: string
 *                             example: "bitcoin"
 *                           name:
 *                             type: string
 *                           symbol:
 *                             type: string
 *                           price:
 *                             type: string
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
 *                           availableBalance:
 *                             type: string
 *                             description: Current balance user has for this currency
 *                             example: "0.5"
 *                           virtualAccountId:
 *                             type: integer
 *                           displayName:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoSellRouter.get('/sell/currencies', authenticateUser, getAvailableCurrenciesForSellController);

/**
 * @swagger
 * /api/v2/crypto/sell/quote:
 *   post:
 *     summary: Calculate sell quote (crypto amount → NGN)
 *     tags: [V2 - Crypto - Sell]
 *     x-order: 2
 *     description: |
 *       Calculates the NGN amount you'll receive for selling a given crypto amount.
 *       This is a quick estimate endpoint that doesn't execute the sale.
 *       
 *       **Rate Calculation:**
 *       1. Gets crypto price from wallet_currencies table
 *       2. Calculates USD value of crypto amount
 *       3. Gets USD to NGN rate from admin-configured rates (crypto_rates table, SELL type)
 *       4. Calculates: Crypto → USD → NGN amount
 *       
 *       **Use this to:**
 *       - Show users how much NGN they'll receive
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
 *                 description: Amount in crypto to sell (e.g., 0.001 for BTC, 15 for USDT)
 *                 example: 0.001
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to sell (e.g., BTC, ETH, USDT_TRON, USDC)
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
 * /api/v2/crypto/sell/preview:
 *   post:
 *     summary: Preview sell transaction (finalize step)
 *     tags: [V2 - Crypto - Sell]
 *     x-order: 3
 *     description: |
 *       Generates a complete preview of the sell transaction before execution.
 *       Shows current balances, projected balances after transaction, rates, and validation status.
 *       
 *       **Use this for:**
 *       - Final confirmation screen before executing the sell
 *       - Showing users exactly what will happen
 *       - Validating sufficient crypto balance before proceeding
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
 *                 description: Amount in crypto to sell
 *                 example: 0.001
 *               currency:
 *                 type: string
 *                 example: "BTC"
 *               blockchain:
 *                 type: string
 *                 example: "bitcoin"
 *     responses:
 *       200:
 *         description: Sell preview generated successfully
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
 *                   example: "Sell transaction preview generated successfully"
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
 *                     rateCryptoToUsd:
 *                       type: string
 *                     rateUsdToNgn:
 *                       type: string
 *                     cryptoBalanceBefore:
 *                       type: string
 *                     fiatBalanceBefore:
 *                       type: string
 *                     cryptoBalanceAfter:
 *                       type: string
 *                     fiatBalanceAfter:
 *                       type: string
 *                     hasSufficientBalance:
 *                       type: boolean
 *                     canProceed:
 *                       type: boolean
 *                     virtualAccountId:
 *                       type: integer
 *                     fiatWalletId:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
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

/**
 * @swagger
 * /api/v2/crypto/sell:
 *   post:
 *     summary: Execute crypto sell transaction
 *     tags: [V2 - Crypto - Sell]
 *     x-order: 4
 *     description: |
 *       Sells cryptocurrency and receives NGN in user's fiat wallet.
 *       
 *       **Sell Flow:**
 *       1. Validates crypto currency exists and gets price
 *       2. Calculates USD value of crypto amount
 *       3. Gets USD to NGN rate from admin rates (crypto_rates table, SELL type)
 *       4. Calculates NGN amount
 *       5. Validates user has sufficient crypto balance
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
 *       
 *       **Flow Step 4:** Execute the sale
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
