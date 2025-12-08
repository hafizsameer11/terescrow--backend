/**
 * User Wallet Routes
 * 
 * Routes for user wallet management and key export
 */

import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  exportUserWalletController,
  exportPrivateKeyController,
  getUserWalletsController,
} from '../../controllers/customer/user.wallet.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Crypto
 *   description: User wallet management and key export
 */

/**
 * @swagger
 * /api/v2/crypto/wallets:
 *   get:
 *     summary: Get all user wallets
 *     tags: [V2 - Crypto]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User wallets retrieved successfully
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
 *                           derivationPath:
 *                             type: string
 *                           addressCount:
 *                             type: integer
 *                           createdAt:
 *                             type: string
 */
router.get('/wallets', authenticateUser, getUserWalletsController);

/**
 * @swagger
 * /api/v2/crypto/wallets/export:
 *   post:
 *     summary: Export user wallet (mnemonic + addresses)
 *     tags: [V2 - Crypto]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blockchain
 *               - pin
 *             properties:
 *               blockchain:
 *                 type: string
 *                 example: ethereum
 *               pin:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Wallet exported successfully
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
 *                     mnemonic:
 *                       type: string
 *                     xpub:
 *                       type: string
 *                     derivationPath:
 *                       type: string
 *                     blockchain:
 *                       type: string
 *                     addresses:
 *                       type: array
 *                     warning:
 *                       type: string
 */
router.post('/wallets/export', authenticateUser, exportUserWalletController);

/**
 * @swagger
 * /api/v2/crypto/wallets/export-key:
 *   post:
 *     summary: Export private key for a specific address
 *     tags: [V2 - Crypto]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addressId
 *               - pin
 *             properties:
 *               addressId:
 *                 type: integer
 *                 example: 1
 *               pin:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Private key exported successfully
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
 *                     address:
 *                       type: string
 *                     privateKey:
 *                       type: string
 *                     blockchain:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     warning:
 *                       type: string
 */
router.post('/wallets/export-key', authenticateUser, exportPrivateKeyController);

export default router;

