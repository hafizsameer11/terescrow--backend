/**
 * Crypto Asset Routes (Customer)
 * 
 * Routes for user crypto asset management
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { 
  getUserAssetsController, 
  getAssetDetailController,
  getDepositAddressController 
} from '../../controllers/customer/crypto.asset.controller';

const cryptoAssetRouter = express.Router();

/**
 * @swagger
 * /api/v2/crypto/assets:
 *   get:
 *     summary: Get user's crypto assets
 *     tags: [V2 - Crypto Assets]
 *     description: Get all virtual accounts with balances in USD and Naira
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
 *     summary: Get asset detail by ID
 *     tags: [V2 - Crypto Assets]
 *     description: Get detailed information about a specific virtual account/asset
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Virtual account ID
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
 *                       items:
 *                         type: object
 *                     primaryDepositAddress:
 *                       type: string
 *                     walletCurrency:
 *                       type: object
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
 *     summary: Get deposit address for a currency
 *     tags: [V2 - Crypto Assets]
 *     description: Get deposit address for a specific currency and blockchain
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         example: "BTC"
 *       - in: path
 *         name: blockchain
 *         required: true
 *         schema:
 *           type: string
 *         example: "bitcoin"
 *     responses:
 *       200:
 *         description: Deposit address retrieved successfully
 *       404:
 *         description: Deposit address not found
 */
cryptoAssetRouter.get(
  '/deposit-address/:currency/:blockchain',
  authenticateUser,
  getDepositAddressController
);

export default cryptoAssetRouter;

