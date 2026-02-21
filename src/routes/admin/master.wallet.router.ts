/**
 * Master Wallet Routes (Admin)
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createMasterWalletController,
  getAllMasterWalletsController,
  createAllMasterWalletsController,
  updateAllMasterWalletsController,
  getMasterWalletsBalancesController,
  getDepositAddressController,
  getMasterWalletBalanceSummaryController,
  getMasterWalletAssetsController,
  getMasterWalletTransactionsController,
  postMasterWalletSendController,
  postMasterWalletSwapController,
} from '../../controllers/admin/master.wallet.controller';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';

const masterWalletRouter = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

/**
 * @swagger
 * /api/admin/master-wallet:
 *   post:
 *     summary: Create a master wallet
 *     tags: [Admin - Tatum]
 *     description: Create a master wallet for a blockchain
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blockchain
 *               - endpoint
 *             properties:
 *               blockchain:
 *                 type: string
 *                 example: "ethereum"
 *               endpoint:
 *                 type: string
 *                 example: "/ethereum/wallet"
 *     responses:
 *       201:
 *         description: Master wallet created successfully
 */
masterWalletRouter.post(
  '/',
  [
    body('blockchain').isString().notEmpty(),
    body('endpoint').isString().notEmpty(),
  ],
  createMasterWalletController
);

/**
 * @swagger
 * /api/admin/master-wallet:
 *   get:
 *     summary: Get all master wallets
 *     tags: [Admin - Tatum]
 *     responses:
 *       200:
 *         description: Master wallets retrieved successfully
 */
masterWalletRouter.get('/', getAllMasterWalletsController);

/**
 * @swagger
 * /api/admin/master-wallet/create-all:
 *   post:
 *     summary: Create master wallets for all supported blockchains
 *     tags: [Admin - Tatum]
 *     description: |
 *       Creates master wallets for all supported blockchains at once:
 *       - Bitcoin
 *       - Ethereum
 *       - Tron
 *       - BSC
 *       - Solana
 *       - Litecoin
 *       - Polygon
 *       - Dogecoin
 *       - XRP
 *       
 *       If a master wallet already exists for a blockchain, it will be skipped.
 *     responses:
 *       200:
 *         description: Master wallets creation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     created:
 *                       type: integer
 *                       description: Number of new wallets created
 *                     existing:
 *                       type: integer
 *                       description: Number of wallets that already existed
 *                     errorCount:
 *                       type: integer
 *                       description: Number of errors encountered
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       blockchain:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [created, exists]
 *                       wallet:
 *                         type: object
 */
masterWalletRouter.post('/create-all', createAllMasterWalletsController);

/**
 * @swagger
 * /api/admin/master-wallet/update-all:
 *   post:
 *     summary: Update existing master wallets with missing address and private key
 *     tags: [Admin - Tatum]
 *     description: |
 *       Updates all existing master wallets by generating missing addresses and private keys.
 *       This is useful if wallets were created before the encryption/address generation was implemented.
 *     responses:
 *       200:
 *         description: Master wallets update completed
 */
masterWalletRouter.post('/update-all', updateAllMasterWalletsController);

/**
 * @swagger
 * /api/admin/master-wallet/balances:
 *   get:
 *     summary: Get balances for all master wallets
 *     tags: [Admin - Tatum]
 *     description: Retrieves balances for all master wallet addresses using Tatum API
 *     responses:
 *       200:
 *         description: Master wallet balances retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           blockchain:
 *                             type: string
 *                           address:
 *                             type: string
 *                           balance:
 *                             type: object
 *                             description: Balance data from Tatum API
 *                           error:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                           updatedAt:
 *                             type: string
 */
masterWalletRouter.get('/balances', getMasterWalletsBalancesController);

masterWalletRouter.get('/balances/summary', ...adminOnly, getMasterWalletBalanceSummaryController);
masterWalletRouter.get('/assets', ...adminOnly, getMasterWalletAssetsController);
masterWalletRouter.get('/transactions', ...adminOnly, getMasterWalletTransactionsController);
masterWalletRouter.post('/send', ...adminOnly, postMasterWalletSendController);
masterWalletRouter.post('/swap', ...adminOnly, postMasterWalletSwapController);

/**
 * @swagger
 * /api/admin/master-wallet/deposit-address/{userId}/{currency}/{blockchain}:
 *   get:
 *     summary: Get deposit address for a user
 *     tags: [Admin - Tatum]
 *     description: Retrieves deposit address for a specific user, currency, and blockchain
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code (e.g., BTC, ETH, USDT)
 *       - in: path
 *         name: blockchain
 *         required: true
 *         schema:
 *           type: string
 *         description: Blockchain name (e.g., bitcoin, ethereum, tron)
 *     responses:
 *       200:
 *         description: Deposit address retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     depositAddress:
 *                       type: object
 *                       properties:
 *                         address:
 *                           type: string
 *                         blockchain:
 *                           type: string
 *                         currency:
 *                           type: string
 *                         virtualAccountId:
 *                           type: integer
 *                         balance:
 *                           type: string
 *                         balanceUsd:
 *                           type: string
 *                         balanceNaira:
 *                           type: string
 *                         symbol:
 *                           type: string
 *                           nullable: true
 *       404:
 *         description: Deposit address not found
 */
masterWalletRouter.get('/deposit-address/:userId/:currency/:blockchain', getDepositAddressController);

export default masterWalletRouter;

