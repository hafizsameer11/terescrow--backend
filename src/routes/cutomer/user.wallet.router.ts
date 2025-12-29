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
  generateSolanaWalletController,
  generatePolygonWalletController,
  generateDogecoinWalletController,
  generateXrpWalletController,
} from '../../controllers/customer/user.wallet.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: V2 - Crypto - Wallets
 *     description: User wallet management and key export
 *   - name: V2 - Crypto - Wallet Generation
 *     description: Wallet generation endpoints for specific blockchains
 */

/**
 * @swagger
 * /api/v2/crypto/wallets:
 *   get:
 *     summary: Get all user wallets
 *     tags: [V2 - Crypto - Wallets]
 *     x-order: 1
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
 *     tags: [V2 - Crypto - Wallets]
 *     x-order: 2
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
 *     tags: [V2 - Crypto - Wallets]
 *     x-order: 3
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

/**
 * @swagger
 * /api/v2/crypto/wallets/solana/generate:
 *   post:
 *     summary: Generate Solana wallet for user (if doesn't exist)
 *     tags: [V2 - Crypto - Wallet Generation]
 *     description: |
 *       Generates a Solana wallet for the specified user if one doesn't exist.
 *       Also creates deposit addresses for all Solana virtual accounts.
 *       This endpoint helps fix users who don't have Solana wallet yet.
 *       
 *       **Note**: Solana doesn't use xpub (extended public key) like other blockchains.
 *       Instead, it returns the address directly from wallet generation.
 *       The address is stored in the xpub field in the database for consistency.
 *     x-order: 1
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID for whom to generate the Solana wallet
 *         example: 1
 *     responses:
 *       200:
 *         description: Solana wallet generated successfully (or already exists)
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
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         blockchain:
 *                           type: string
 *                         address:
 *                           type: string
 *                           description: Solana address (stored in xpub field)
 *                         createdAt:
 *                           type: string
 *                     depositAddresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           virtualAccountId:
 *                             type: integer
 *                           currency:
 *                             type: string
 *                           address:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [created, existing, failed]
 *                     message:
 *                       type: string
 *                       description: Present if wallet already exists
 */
router.post('/wallets/solana/generate', generateSolanaWalletController);

/**
 * @swagger
 * /api/v2/crypto/wallets/polygon/generate:
 *   post:
 *     summary: Generate Polygon wallet for user (if doesn't exist)
 *     tags: [V2 - Crypto - Wallet Generation]
 *     description: |
 *       Generates a Polygon wallet for the specified user if one doesn't exist.
 *       Also creates deposit addresses for all Polygon virtual accounts.
 *       This endpoint helps fix users who don't have Polygon wallet yet.
 *     x-order: 2
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID for whom to generate the Polygon wallet
 *         example: 1
 *     responses:
 *       200:
 *         description: Polygon wallet generated successfully (or already exists)
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
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         blockchain:
 *                           type: string
 *                         address:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                     depositAddresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           virtualAccountId:
 *                             type: integer
 *                           currency:
 *                             type: string
 *                           address:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [created, existing, failed]
 *                     message:
 *                       type: string
 *                       description: Present if wallet already exists
 */
router.post('/wallets/polygon/generate', generatePolygonWalletController);

/**
 * @swagger
 * /api/v2/crypto/wallets/dogecoin/generate:
 *   post:
 *     summary: Generate Dogecoin wallet for user (if doesn't exist)
 *     tags: [V2 - Crypto - Wallet Generation]
 *     description: |
 *       Generates a Dogecoin wallet for the specified user if one doesn't exist.
 *       Also creates deposit addresses for all Dogecoin virtual accounts.
 *       This endpoint helps fix users who don't have Dogecoin wallet yet.
 *     x-order: 3
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID for whom to generate the Dogecoin wallet
 *         example: 1
 *     responses:
 *       200:
 *         description: Dogecoin wallet generated successfully (or already exists)
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
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         blockchain:
 *                           type: string
 *                         address:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                     depositAddresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           virtualAccountId:
 *                             type: integer
 *                           currency:
 *                             type: string
 *                           address:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [created, existing, failed]
 *                     message:
 *                       type: string
 *                       description: Present if wallet already exists
 */
router.post('/wallets/dogecoin/generate', generateDogecoinWalletController);

/**
 * @swagger
 * /api/v2/crypto/wallets/xrp/generate:
 *   post:
 *     summary: Generate XRP wallet for user (if doesn't exist)
 *     tags: [V2 - Crypto - Wallet Generation]
 *     description: |
 *       Generates an XRP wallet for the specified user if one doesn't exist.
 *       Also creates deposit addresses for all XRP virtual accounts.
 *       This endpoint helps fix users who don't have XRP wallet yet.
 *       
 *       **Note**: XRP doesn't use xpub (extended public key) like other blockchains.
 *       Instead, it returns the address and secret directly from wallet generation.
 *       The address is stored in the xpub field in the database for consistency.
 *     x-order: 4
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID for whom to generate the XRP wallet
 *         example: 1
 *     responses:
 *       200:
 *         description: XRP wallet generated successfully (or already exists)
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
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         blockchain:
 *                           type: string
 *                         address:
 *                           type: string
 *                           description: XRP address (stored in xpub field)
 *                         createdAt:
 *                           type: string
 *                     depositAddresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           virtualAccountId:
 *                             type: integer
 *                           currency:
 *                             type: string
 *                           address:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [created, existing, failed]
 *                     message:
 *                       type: string
 *                       description: Present if wallet already exists
 */
router.post('/wallets/xrp/generate', generateXrpWalletController);

export default router;

