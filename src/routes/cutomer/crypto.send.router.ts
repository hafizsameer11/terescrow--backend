/**
 * Crypto Send Routes (Customer)
 * 
 * Routes for user crypto send operations to external addresses
 * 
 * Flow Order:
 * 1. POST /send/preview - Preview transaction with balances and gas fees
 * 2. POST /send - Execute send transaction
 */

import express from 'express';
import { body } from 'express-validator';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  previewSendController,
  sendCryptoController,
} from '../../controllers/customer/crypto.send.controller';

const cryptoSendRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/send/preview:
 *   post:
 *     summary: Preview send transaction with balances and gas fees
 *     tags: [V2 - Crypto - Send]
 *     x-order: 1
 *     description: |
 *       Previews a cryptocurrency send transaction to an external address.
 *       Shows current balances, estimated gas fees, and transaction details.
 *       
 *       **Features:**
 *       - Validates user has sufficient crypto balance
 *       - Checks native ETH balance (for USDT transfers - required for gas)
 *       - Calculates gas fees (in ETH, USD, and NGN)
 *       - Shows balance before and after transaction
 *       - Validates recipient address format
 *       
 *       **For USDT transfers:**
 *       - Requires native ETH for gas fees
 *       - If insufficient ETH, returns error asking user to buy ETH first
 *       - Checks if user has enough ETH to cover gas fees
 *       
 *       **Supported:**
 *       - Ethereum blockchain only
 *       - ETH (native) and USDT (ERC-20) tokens
 *       
 *       **Flow Step 1:** Preview before sending
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
 *               - toAddress
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in crypto currency (e.g., 6 for 6 USDT, 0.001 for 0.001 ETH)
 *                 example: 6
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to send (ETH or USDT)
 *                 example: "USDT"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network (ethereum)
 *                 example: "ethereum"
 *               toAddress:
 *                 type: string
 *                 description: Recipient Ethereum address (must start with 0x and be 42 characters)
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *     responses:
 *       200:
 *         description: Send transaction preview generated successfully
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
 *                   example: "Send transaction preview generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     currency:
 *                       type: string
 *                       example: "USDT"
 *                     blockchain:
 *                       type: string
 *                       example: "ethereum"
 *                     currencyName:
 *                       type: string
 *                       example: "USDT ETH"
 *                     currencySymbol:
 *                       type: string
 *                       nullable: true
 *                       example: "wallet_symbols/TUSDT.png"
 *                     amount:
 *                       type: string
 *                       example: "6"
 *                     amountUsd:
 *                       type: string
 *                       example: "6"
 *                     toAddress:
 *                       type: string
 *                       example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *                     fromAddress:
 *                       type: string
 *                       example: "0xc995f6d188ff469d736f1ef23cf3b48c515ee2ba"
 *                     gasFee:
 *                       type: object
 *                       properties:
 *                         eth:
 *                           type: string
 *                           example: "0.00000351"
 *                         usd:
 *                           type: string
 *                           example: "0.0090863019"
 *                         gasLimit:
 *                           type: string
 *                           example: "78000"
 *                         gasPrice:
 *                           type: object
 *                           properties:
 *                             wei:
 *                               type: string
 *                               example: "44993619"
 *                             gwei:
 *                               type: string
 *                               example: "0.04"
 *                         gasFeeEth:
 *                           type: string
 *                           example: "0.00000351"
 *                         gasFeeUsd:
 *                           type: string
 *                           example: "0.0090863019"
 *                     userEthBalance:
 *                       type: string
 *                       example: "0.00100305"
 *                     hasSufficientEth:
 *                       type: boolean
 *                       example: true
 *                       description: Whether user has sufficient ETH for gas fees (for USDT transfers)
 *                     cryptoBalanceBefore:
 *                       type: string
 *                       example: "16"
 *                     cryptoBalanceAfter:
 *                       type: string
 *                       example: "10"
 *                     hasSufficientBalance:
 *                       type: boolean
 *                       example: true
 *                     canProceed:
 *                       type: boolean
 *                       example: true
 *                       description: Whether transaction can proceed (false if insufficient ETH for gas)
 *                     virtualAccountId:
 *                       type: integer
 *                       example: 36
 *       400:
 *         description: Bad request (validation failed, insufficient balance, invalid address, insufficient ETH for gas)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoSendRouter.post(
  '/send/preview',
  authenticateUser,
  [
    body('amount').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
    body('toAddress').isString().notEmpty().withMessage('Recipient address is required'),
  ],
  previewSendController
);

/**
 * @swagger
 * /api/v2/crypto/send:
 *   post:
 *     summary: Send cryptocurrency to external address
 *     tags: [V2 - Crypto - Send]
 *     x-order: 2
 *     description: |
 *       Sends cryptocurrency from user's wallet to an external address.
 *       Executes the actual blockchain transfer and debits the user's virtual account.
 *       
 *       **Process:**
 *       1. Validates user has sufficient crypto balance
 *       2. Checks native ETH balance (for USDT - required for gas)
 *       3. Calculates gas fees
 *       4. Executes blockchain transfer
 *       5. Debits virtual account
 *       6. Creates transaction record
 *       
 *       **For USDT transfers:**
 *       - Requires native ETH for gas fees
 *       - If insufficient ETH, transaction fails with error
 *       - User must buy ETH first before sending USDT
 *       
 *       **Supported:**
 *       - Ethereum blockchain only
 *       - ETH (native) and USDT (ERC-20) tokens
 *       
 *       **Flow Step 2:** Execute the send after preview
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
 *               - toAddress
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in crypto currency (e.g., 6 for 6 USDT, 0.001 for 0.001 ETH)
 *                 example: 6
 *               currency:
 *                 type: string
 *                 description: Cryptocurrency to send (ETH or USDT)
 *                 example: "USDT"
 *               blockchain:
 *                 type: string
 *                 description: Blockchain network (ethereum)
 *                 example: "ethereum"
 *               toAddress:
 *                 type: string
 *                 description: Recipient Ethereum address (must start with 0x and be 42 characters)
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *     responses:
 *       200:
 *         description: Cryptocurrency sent successfully
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
 *                   example: "Cryptocurrency sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       example: "SEND-1765653880777-13-vvesb1djd"
 *                     amount:
 *                       type: string
 *                       example: "6"
 *                     amountUsd:
 *                       type: string
 *                       example: "6"
 *                     toAddress:
 *                       type: string
 *                       example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *                     txHash:
 *                       type: string
 *                       example: "0x50591a32f314cf1c145add29a8c93a53984e4d37a552865123d3618fac46b8ed"
 *                     networkFee:
 *                       type: string
 *                       example: "0.00000351"
 *                       description: Gas fee in ETH
 *                     virtualAccountId:
 *                       type: integer
 *                       example: 36
 *                     balanceBefore:
 *                       type: string
 *                       example: "16"
 *                     balanceAfter:
 *                       type: string
 *                       example: "10"
 *       400:
 *         description: Bad request (validation failed, insufficient balance, invalid address, insufficient ETH for gas)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoSendRouter.post(
  '/send',
  authenticateUser,
  [
    body('amount').isFloat({ min: 0.00000001 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().notEmpty().withMessage('Currency is required'),
    body('blockchain').isString().notEmpty().withMessage('Blockchain is required'),
    body('toAddress').isString().notEmpty().withMessage('Recipient address is required'),
  ],
  sendCryptoController
);

export default cryptoSendRouter;

