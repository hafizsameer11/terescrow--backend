/**
 * Master Wallet Routes (Admin)
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createMasterWalletController,
  getAllMasterWalletsController,
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

export default masterWalletRouter;

