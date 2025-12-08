/**
 * Crypto Swap Routes (Customer)
 * 
 * Routes for user crypto swap operations
 * 
 * Flow Order:
 * 1. GET /swap/currencies - Get available currencies (user must have balance > 0)
 * 2. POST /swap/quote - Calculate swap quote (fromCurrency amount → toCurrency amount + gas fees)
 * 3. POST /swap/preview - Preview transaction with balances
 * 4. POST /swap - Execute swap
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAvailableCurrenciesForSwapController,
  calculateSwapQuoteController,
  previewSwapController,
  swapCryptoController,
} from '../../controllers/customer/crypto.swap.controller';

const cryptoSwapRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/swap/currencies:
 *   get:
 *     summary: Get available currencies for swapping (user must have balance > 0)
 *     tags: [V2 - Crypto - Swap]
 *     x-order: 1
 *     description: |
 *       Returns a list of cryptocurrencies the user can swap FROM (only currencies with balance > 0).
 *       Includes current balance, currency details, prices, and blockchain information.
 *       
 *       **Use this to:**
 *       - Populate currency/blockchain selection dropdowns for swapping
 *       - Show only currencies user actually owns
 *       - Display current balances for each currency
 *       
 *       **Flow Step 1:** Start here to get available currencies to swap from
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available currencies for swapping retrieved successfully
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
 *                   example: "Available currencies for swapping retrieved successfully"
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
 *                             example: "ETH"
 *                           blockchain:
 *                             type: string
 *                             example: "ethereum"
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
cryptoSwapRouter.get('/swap/currencies', authenticateUser, getAvailableCurrenciesForSwapController);

/**
 * @swagger
 * /api/v2/crypto/swap/quote:
 *   post:
 *     summary: Calculate swap quote (fromCurrency amount → toCurrency amount + gas fees)
 *     tags: [V2 - Crypto - Swap]
 *     x-order: 2
 *     description: |
 *       Calculates the amount of toCurrency you'll receive for swapping a given fromCurrency amount.
 *       Includes gas fee calculation in the quote.
 *       This is a quick estimate endpoint that doesn't execute the swap.
 *       
 *       **Rate Calculation:**
 *       1. Gets fromCurrency price from wallet_currencies table
 *       2. Calculates USD value of fromAmount
 *       3. Gets toCurrency price from wallet_currencies table
 *       4. Calculates toAmount: USD value / toCurrency price
 *       5. Calculates gas fee (currently 0.5% of swap amount or minimum $5)
 *       6. Calculates total: fromAmount + gasFee
 *       
 *       **Use this to:**
 *       - Show users how much toCurrency they'll receive
 *       - Display gas fees
 *       - Validate amounts
 *       
 *       **Flow Step 2:** After selecting currencies, get quote
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromAmount
 *               - fromCurrency
 *               - fromBlockchain
 *               - toCurrency
 *               - toBlockchain
 *             properties:
 *               fromAmount:
 *                 type: number
 *                 description: Amount in fromCurrency to swap (e.g., 0.0024 for ETH)
 *                 example: 0.0024
 *               fromCurrency:
 *                 type: string
 *                 description: Cryptocurrency to swap FROM (e.g., ETH, BTC, USDT)
 *                 example: "ETH"
 *               fromBlockchain:
 *                 type: string
 *                 description: Blockchain of fromCurrency (e.g., ethereum, bitcoin, tron)
 *                 example: "ethereum"
 *               toCurrency:
 *                 type: string
 *                 description: Cryptocurrency to swap TO (e.g., USDC, USDT, BTC)
 *                 example: "USDC"
 *               toBlockchain:
 *                 type: string
 *                 description: Blockchain of toCurrency (e.g., ethereum, bitcoin, tron)
 *                 example: "ethereum"
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
 *                   example: "Swap quote calculated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     fromAmount:
 *                       type: string
 *                       example: "0.0024"
 *                     fromAmountUsd:
 *                       type: string
 *                       example: "200"
 *                     toAmount:
 *                       type: string
 *                       example: "200"
 *                     toAmountUsd:
 *                       type: string
 *                       example: "200"
 *                     gasFee:
 *                       type: string
 *                       description: Gas fee in fromCurrency
 *                       example: "0.0003"
 *                     gasFeeUsd:
 *                       type: string
 *                       description: Gas fee in USD
 *                       example: "10"
 *                     totalAmount:
 *                       type: string
 *                       description: Total amount (fromAmount + gasFee) in fromCurrency
 *                       example: "0.0027"
 *                     totalAmountUsd:
 *                       type: string
 *                       description: Total amount in USD
 *                       example: "210"
 *                     rateFromToUsd:
 *                       type: string
 *                       description: From currency price in USD
 *                       example: "83333.33"
 *                     rateToToUsd:
 *                       type: string
 *                       description: To currency price in USD
 *                       example: "1"
 *                     fromCurrency:
 *                       type: string
 *                       example: "ETH"
 *                     fromBlockchain:
 *                       type: string
 *                       example: "ethereum"
 *                     toCurrency:
 *                       type: string
 *                       example: "USDC"
 *                     toBlockchain:
 *                       type: string
 *                       example: "ethereum"
 *                     fromCurrencyName:
 *                       type: string
 *                       example: "Ethereum"
 *                     fromCurrencySymbol:
 *                       type: string
 *                       example: "wallet_symbols/eth.png"
 *                     toCurrencyName:
 *                       type: string
 *                       example: "USDC"
 *                     toCurrencySymbol:
 *                       type: string
 *                       example: "wallet_symbols/usdc.png"
 *       400:
 *         description: Bad request (invalid input or currency not supported)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoSwapRouter.post(
  '/swap/quote',
  authenticateUser,
  [
    body('fromAmount').isNumeric().withMessage('From amount must be a number').isFloat({ min: 0.00000001 }).withMessage('From amount must be greater than 0'),
    body('fromCurrency').isString().notEmpty().withMessage('From currency is required'),
    body('fromBlockchain').isString().notEmpty().withMessage('From blockchain is required'),
    body('toCurrency').isString().notEmpty().withMessage('To currency is required'),
    body('toBlockchain').isString().notEmpty().withMessage('To blockchain is required'),
  ],
  calculateSwapQuoteController
);

/**
 * @swagger
 * /api/v2/crypto/swap/preview:
 *   post:
 *     summary: Preview swap transaction (finalize step)
 *     tags: [V2 - Crypto - Swap]
 *     x-order: 3
 *     description: |
 *       Generates a complete preview of the swap transaction before execution.
 *       Shows current balances, projected balances after transaction, rates, gas fees, and validation status.
 *       
 *       **Use this for:**
 *       - Final confirmation screen before executing the swap
 *       - Showing users exactly what will happen
 *       - Validating sufficient balance (including gas fees) before proceeding
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
 *               - fromAmount
 *               - fromCurrency
 *               - fromBlockchain
 *               - toCurrency
 *               - toBlockchain
 *             properties:
 *               fromAmount:
 *                 type: number
 *                 description: Amount in fromCurrency to swap
 *                 example: 0.0024
 *               fromCurrency:
 *                 type: string
 *                 example: "ETH"
 *               fromBlockchain:
 *                 type: string
 *                 example: "ethereum"
 *               toCurrency:
 *                 type: string
 *                 example: "USDC"
 *               toBlockchain:
 *                 type: string
 *                 example: "ethereum"
 *     responses:
 *       200:
 *         description: Swap preview generated successfully
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
 *                   example: "Swap transaction preview generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     fromAmount:
 *                       type: string
 *                     fromAmountUsd:
 *                       type: string
 *                     toAmount:
 *                       type: string
 *                     toAmountUsd:
 *                       type: string
 *                     gasFee:
 *                       type: string
 *                     gasFeeUsd:
 *                       type: string
 *                     totalAmount:
 *                       type: string
 *                     totalAmountUsd:
 *                       type: string
 *                     rateFromToUsd:
 *                       type: string
 *                     rateToToUsd:
 *                       type: string
 *                     fromCurrency:
 *                       type: string
 *                     fromBlockchain:
 *                       type: string
 *                     toCurrency:
 *                       type: string
 *                     toBlockchain:
 *                       type: string
 *                     fromBalanceBefore:
 *                       type: string
 *                     toBalanceBefore:
 *                       type: string
 *                     fromBalanceAfter:
 *                       type: string
 *                     toBalanceAfter:
 *                       type: string
 *                     hasSufficientBalance:
 *                       type: boolean
 *                     canProceed:
 *                       type: boolean
 *                     fromVirtualAccountId:
 *                       type: integer
 *                     toVirtualAccountId:
 *                       type: integer
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoSwapRouter.post(
  '/swap/preview',
  authenticateUser,
  [
    body('fromAmount').isNumeric().withMessage('From amount must be a number').isFloat({ min: 0.00000001 }).withMessage('From amount must be greater than 0'),
    body('fromCurrency').isString().notEmpty().withMessage('From currency is required'),
    body('fromBlockchain').isString().notEmpty().withMessage('From blockchain is required'),
    body('toCurrency').isString().notEmpty().withMessage('To currency is required'),
    body('toBlockchain').isString().notEmpty().withMessage('To blockchain is required'),
  ],
  previewSwapController
);

/**
 * @swagger
 * /api/v2/crypto/swap:
 *   post:
 *     summary: Execute crypto swap transaction
 *     tags: [V2 - Crypto - Swap]
 *     x-order: 4
 *     description: |
 *       Swaps one cryptocurrency for another.
 *       
 *       **Swap Flow:**
 *       1. Validates both currencies exist and gets prices
 *       2. Calculates USD value of fromAmount
 *       3. Calculates toAmount based on toCurrency price
 *       4. Calculates gas fees
 *       5. Validates user has sufficient fromCurrency balance (including gas)
 *       6. Debits fromCurrency (including gas) from virtual account
 *       7. Credits toCurrency to virtual account
 *       8. Creates transaction records
 *       
 *       **Future Implementation (TODO):**
 *       - Check user's deposit addresses have sufficient on-chain balances
 *       - Estimate actual gas fees from blockchain
 *       - Transfer fromCurrency on blockchain (from user address to master wallet)
 *       - Transfer toCurrency on blockchain (from master wallet to user address)
 *       - Keep detailed blockchain transaction records
 *       
 *       **Note:** Currently, this is an internal ledger operation.
 *       The actual blockchain transfers will be implemented later.
 *       
 *       **Flow Step 4:** Execute the swap
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromAmount
 *               - fromCurrency
 *               - fromBlockchain
 *               - toCurrency
 *               - toBlockchain
 *             properties:
 *               fromAmount:
 *                 type: number
 *                 description: Amount in fromCurrency to swap (must exist in user's virtual account)
 *                 example: 0.0024
 *               fromCurrency:
 *                 type: string
 *                 description: Cryptocurrency to swap FROM (must exist in wallet_currencies)
 *                 example: "ETH"
 *               fromBlockchain:
 *                 type: string
 *                 description: Blockchain of fromCurrency
 *                 example: "ethereum"
 *               toCurrency:
 *                 type: string
 *                 description: Cryptocurrency to swap TO (must exist in wallet_currencies)
 *                 example: "USDC"
 *               toBlockchain:
 *                 type: string
 *                 description: Blockchain of toCurrency
 *                 example: "ethereum"
 *     responses:
 *       200:
 *         description: Cryptocurrency swapped successfully
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
 *                   example: "Cryptocurrency swapped successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       description: Unique transaction ID
 *                     fromAmount:
 *                       type: string
 *                       example: "0.0024"
 *                     fromAmountUsd:
 *                       type: string
 *                       example: "200"
 *                     toAmount:
 *                       type: string
 *                       example: "200"
 *                     toAmountUsd:
 *                       type: string
 *                       example: "200"
 *                     gasFee:
 *                       type: string
 *                       example: "0.0003"
 *                     gasFeeUsd:
 *                       type: string
 *                       example: "10"
 *                     totalAmount:
 *                       type: string
 *                       example: "0.0027"
 *                     totalAmountUsd:
 *                       type: string
 *                       example: "210"
 *                     rateFromToUsd:
 *                       type: string
 *                     rateToToUsd:
 *                       type: string
 *                     fromVirtualAccountId:
 *                       type: integer
 *                     toVirtualAccountId:
 *                       type: integer
 *                     fromBalanceBefore:
 *                       type: string
 *                     fromBalanceAfter:
 *                       type: string
 *                     toBalanceBefore:
 *                       type: string
 *                     toBalanceAfter:
 *                       type: string
 *       400:
 *         description: Bad request (insufficient balance, invalid input, currency not supported)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Virtual account not found
 *       500:
 *         description: Server error
 */
cryptoSwapRouter.post(
  '/swap',
  authenticateUser,
  [
    body('fromAmount').isNumeric().withMessage('From amount must be a number').isFloat({ min: 0.00000001 }).withMessage('From amount must be greater than 0'),
    body('fromCurrency').isString().notEmpty().withMessage('From currency is required'),
    body('fromBlockchain').isString().notEmpty().withMessage('From blockchain is required'),
    body('toCurrency').isString().notEmpty().withMessage('To currency is required'),
    body('toBlockchain').isString().notEmpty().withMessage('To blockchain is required'),
  ],
  swapCryptoController
);

export default cryptoSwapRouter;

