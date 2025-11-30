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
} from '../../controllers/admin/master.wallet.controller';
// import authenticateAdmin from '../../middlewares/authenticate.admin'; // Add admin auth if needed

const masterWalletRouter = express.Router();

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

export default masterWalletRouter;

