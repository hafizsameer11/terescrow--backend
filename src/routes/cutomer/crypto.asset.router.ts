/**
 * Crypto Asset Routes (Customer)
 * 
 * Complete crypto management routes:
 * - Asset Management: View all assets, asset details, balances
 * - Deposit Addresses: Get receiving addresses for crypto
 * - Transactions: Buy, sell, view transaction history
 * - Wallet Export: Export mnemonic and private keys (non-custodial)
 * 
 * All routes are grouped under "V2 - Crypto" tag in Swagger UI
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { 
  getUserAssetsController, 
  getAssetDetailController,
  getDepositAddressController,
  getReceiveAddressController
} from '../../controllers/customer/crypto.asset.controller';

const cryptoAssetRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/assets:
 *   get:
 *     summary: Get user's complete crypto assets portfolio
 *     tags: [V2 - Crypto]
 *     description: |
 *       Retrieves all user's virtual accounts (crypto assets) with:
 *       - Current balances from virtual_account table
 *       - USD and Naira conversions
 *       - Currency icons (symbol field contains path like "wallet_symbols/btc.png")
 *       - Deposit addresses for each asset
 *       
 *       **How it works:**
 *       - Each user has virtual accounts for supported currencies (BTC, ETH, USDT, etc.)
 *       - Balances are stored in the virtual_account table and updated via webhooks
 *       - Each asset includes its deposit address where users can receive funds
 *       - All currencies on the same blockchain share the same deposit address
 *         (e.g., ETH, USDT, USDC on Ethereum all use the same address)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assets retrieved successfully
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
 *                   example: "Assets retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     assets:
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
 *                           symbol:
 *                             type: string
 *                             description: Currency icon path format wallet_symbols currency png. Use this to display the currency icon in your UI.
 *                             example: "wallet_symbols/btc.png"
 *                           name:
 *                             type: string
 *                             example: "BTC"
 *                           balance:
 *                             type: string
 *                             example: "0.001"
 *                           balanceUsd:
 *                             type: string
 *                             example: "104.12"
 *                           balanceNaira:
 *                             type: string
 *                             example: "182210"
 *                           price:
 *                             type: string
 *                             example: "104120"
 *                           nairaPrice:
 *                             type: string
 *                             example: "1750000"
 *                           depositAddress:
 *                             type: string
 *                             example: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
 *                           active:
 *                             type: boolean
 *                           frozen:
 *                             type: boolean
 *                     totals:
 *                       type: object
 *                       properties:
 *                         totalUsd:
 *                           type: string
 *                         totalNaira:
 *                           type: string
 *                     count:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
cryptoAssetRouter.get('/assets', authenticateUser, getUserAssetsController);

/**
 * @swagger
 * /api/v2/crypto/assets/{id}:
 *   get:
 *     summary: Get detailed information about a specific asset/currency
 *     tags: [V2 - Crypto]
 *     description: |
 *       Retrieves comprehensive details for a specific virtual account/currency including:
 *       - Current balance and account balance
 *       - USD and Naira conversions
 *       - Currency icon (symbol field)
 *       - All deposit addresses associated with this asset
 *       - Complete transaction history for this asset/currency
 *       - Wallet currency metadata (token type, contract address, decimals, etc.)
 *       
 *       **Transaction History:**
 *       - Returns all transactions (Buy, Sell, Send, Receive, Swap) for this virtual account
 *       - Includes transaction details, amounts, status, timestamps
 *       - Limited to 50 most recent transactions by default
 *       
 *       **Deposit Address:**
 *       - Returns the primary deposit address where users can receive this currency
 *       - For tokens on the same blockchain (e.g., USDT on Ethereum), they share the same address as ETH
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Virtual account ID (can be found from GET /api/v2/crypto/assets)
 *         example: 1
 *     responses:
 *       200:
 *         description: Asset detail retrieved successfully
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
 *                   example: "Asset detail retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     currency:
 *                       type: string
 *                       example: "BTC"
 *                     blockchain:
 *                       type: string
 *                       example: "bitcoin"
 *                     symbol:
 *                       type: string
 *                       example: "wallet_symbols/btc.png"
 *                     name:
 *                       type: string
 *                       example: "BTC"
 *                     accountCode:
 *                       type: string
 *                     accountId:
 *                       type: string
 *                     availableBalance:
 *                       type: string
 *                       example: "0.001"
 *                     accountBalance:
 *                       type: string
 *                       example: "0.001"
 *                     availableBalanceUsd:
 *                       type: string
 *                       example: "104.12"
 *                     accountBalanceUsd:
 *                       type: string
 *                       example: "104.12"
 *                     availableBalanceNaira:
 *                       type: string
 *                       example: "182210"
 *                     accountBalanceNaira:
 *                       type: string
 *                       example: "182210"
 *                     price:
 *                       type: string
 *                       example: "104120"
 *                     nairaPrice:
 *                       type: string
 *                       example: "1750000"
 *                     active:
 *                       type: boolean
 *                     frozen:
 *                       type: boolean
 *                     depositAddresses:
 *                       type: array
 *                       description: All deposit addresses for this asset
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           address:
 *                             type: string
 *                           blockchain:
 *                             type: string
 *                           currency:
 *                             type: string
 *                     primaryDepositAddress:
 *                       type: string
 *                       description: Primary deposit address for receiving funds
 *                       example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *                     transactions:
 *                       type: array
 *                       description: Transaction history for this asset (Buy, Sell, Send, Receive, Swap)
 *                       items:
 *                         type: object
 *                     transactionCount:
 *                       type: integer
 *                       description: Number of transactions returned
 *                     walletCurrency:
 *                       type: object
 *                       description: Wallet currency metadata (token type, contract address, decimals, etc.)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       500:
 *         description: Server error
 */
cryptoAssetRouter.get('/assets/:id', authenticateUser, getAssetDetailController);

/**
 * @swagger
 * /api/v2/crypto/deposit-address/{currency}/{blockchain}:
 *   get:
 *     summary: Get receiving deposit address for a specific currency
 *     tags: [V2 - Crypto]
 *     description: |
 *       Retrieves the deposit address where users can receive a specific cryptocurrency.
 *       
 *       **How Deposit Addresses Work:**
 *       - Each user has a unique deposit address per blockchain
 *       - All currencies on the same blockchain share the same deposit address
 *       - Example: ETH, USDT, and USDC on Ethereum all use the same address
 *       - The address is linked to the user's virtual account for that currency/blockchain
 *       
 *       **Address Reuse:**
 *       - When requesting an address for USDT on Ethereum, if the user already has an ETH address,
 *         the same address will be returned (addresses are shared within blockchain groups)
 *       - This ensures users only need to manage one address per blockchain
 *       
 *       **Response includes:**
 *       - The deposit address
 *       - Current balance for that currency
 *       - USD and Naira conversions
 *       - Currency symbol (icon path)
 *       - Virtual account ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code (e.g., BTC, ETH, USDT, USDC)
 *         example: "USDT"
 *       - in: path
 *         name: blockchain
 *         required: true
 *         schema:
 *           type: string
 *         description: Blockchain name (e.g., bitcoin, ethereum, bsc, tron)
 *         example: "ethereum"
 *     responses:
 *       200:
 *         description: Deposit address retrieved successfully
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
 *                   example: "Deposit address retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: The deposit address where funds can be sent
 *                       example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *                     blockchain:
 *                       type: string
 *                       example: "ethereum"
 *                     currency:
 *                       type: string
 *                       example: "USDT"
 *                     virtualAccountId:
 *                       type: integer
 *                       description: ID of the virtual account this address belongs to
 *                     balance:
 *                       type: string
 *                       description: Current balance for this currency
 *                       example: "100.50"
 *                     balanceUsd:
 *                       type: string
 *                       description: Balance in USD
 *                       example: "100.50"
 *                     balanceNaira:
 *                       type: string
 *                       description: Balance in Naira
 *                       example: "150750"
 *                     symbol:
 *                       type: string
 *                       description: Currency icon path
 *                       example: "wallet_symbols/usdt.png"
 *       400:
 *         description: Bad request - currency and blockchain are required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deposit address not found (virtual account or deposit address doesn't exist for this currency/blockchain)
 *       500:
 *         description: Server error
 */
cryptoAssetRouter.get(
  '/deposit-address/:currency/:blockchain',
  authenticateUser,
  getDepositAddressController
);

/**
 * @swagger
 * /api/v2/crypto/receive/{accountId}:
 *   get:
 *     summary: Get deposit address for receiving crypto (by virtual account ID)
 *     tags: [V2 - Crypto]
 *     description: |
 *       **Receive Flow:**
 *       1. User clicks "Receive" button
 *       2. Gets all assets via GET /api/v2/crypto/assets
 *       3. User selects an asset from the list
 *       4. Calls this endpoint with the virtual account ID
 *       5. Returns the deposit address for that asset
 *       
 *       **Address Sharing:**
 *       - All currencies on the same blockchain share the same deposit address
 *       - Example: If user selects "USDT on Tron", they'll get the same address as "TRON"
 *       - The address returned will be for the base blockchain (e.g., Tron address for USDT_TRON)
 *       
 *       **Response includes:**
 *       - The deposit address (shared within blockchain group)
 *       - Current balance for the selected currency
 *       - USD and Naira conversions
 *       - Currency icon and metadata
 *       - Both the account currency and the address currency (may differ for tokens)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Virtual account ID (from GET /api/v2/crypto/assets)
 *         example: 1
 *     responses:
 *       200:
 *         description: Deposit address retrieved successfully
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
 *                   example: "Deposit address retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: The deposit address (shared within blockchain group)
 *                       example: "TABpkXRdNG49AMvbGeNXQ9AR9X2neT2WVM"
 *                     blockchain:
 *                       type: string
 *                       description: Blockchain of the deposit address
 *                       example: "tron"
 *                     currency:
 *                       type: string
 *                       description: Currency of the deposit address (may be base blockchain currency)
 *                       example: "TRON"
 *                     accountCurrency:
 *                       type: string
 *                       description: The currency of the virtual account (what user selected)
 *                       example: "USDT_TRON"
 *                     accountBlockchain:
 *                       type: string
 *                       description: The blockchain of the virtual account
 *                       example: "tron"
 *                     virtualAccountId:
 *                       type: integer
 *                       description: ID of the virtual account
 *                     balance:
 *                       type: string
 *                       description: Current balance for the selected currency
 *                       example: "100.50"
 *                     balanceUsd:
 *                       type: string
 *                       example: "100.50"
 *                     balanceNaira:
 *                       type: string
 *                       example: "150750"
 *                     symbol:
 *                       type: string
 *                       description: Currency icon path
 *                       example: "wallet_symbols/usdt.png"
 *                     currencyName:
 *                       type: string
 *                       description: Display name of the currency
 *                       example: "USDT TRON"
 *                     addressShared:
 *                       type: boolean
 *                       description: True if the address is shared with other currencies on the same blockchain (e.g., USDT_TRON shares address with TRON)
 *                       example: true
 *       400:
 *         description: Bad request (invalid account ID)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Virtual account or deposit address not found
 *       500:
 *         description: Server error
 */
cryptoAssetRouter.get(
  '/receive/:accountId',
  authenticateUser,
  getReceiveAddressController
);

export default cryptoAssetRouter;

