/**
 * Gift Card Admin Routes
 * 
 * Admin endpoints for gift card management:
 * - Sync products
 * - Upload images
 * - View sync logs
 * - Token management
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import upload from '../../middlewares/multer.middleware';
import {
  syncProductsController,
  getSyncLogsController,
  uploadProductImageController,
  getReloadlyTokenStatusController,
  refreshReloadlyTokenController,
} from '../../controllers/admin/giftcard.admin.controller';

const giftCardAdminRouter = express.Router();

// All routes require authentication
giftCardAdminRouter.use(authenticateUser);

// TODO: Add admin role check middleware

/**
 * @swagger
 * /api/admin/giftcards/sync-products:
 *   post:
 *     summary: Sync products from Reloadly
 *     tags: [V2 - Admin - Gift Cards]
 *     description: |
 *       **V2 API** - Sync gift card products from Reloadly API to local database.
 *       Fetches real products from Reloadly and stores them locally.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               syncType:
 *                 type: string
 *                 enum: [full, incremental, manual]
 *                 default: manual
 *     responses:
 *       200:
 *         description: Sync initiated successfully
 */
giftCardAdminRouter.post('/sync-products', syncProductsController);

/**
 * @swagger
 * /api/admin/giftcards/sync-logs:
 *   get:
 *     summary: Get product sync logs
 *     tags: [V2 - Admin - Gift Cards]
 *     description: |
 *       **V2 API** - Get history of product sync operations.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Sync logs retrieved successfully
 */
giftCardAdminRouter.get('/sync-logs', getSyncLogsController);

/**
 * @swagger
 * /api/admin/giftcards/products/{productId}/upload-image:
 *   post:
 *     summary: Upload custom image for product (only if Reloadly image missing)
 *     tags: [V2 - Admin - Gift Cards]
 *     description: |
 *       **V2 API** - Upload custom product image.
 *       Only allowed when Reloadly doesn't provide an image.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Product already has Reloadly image
 */
giftCardAdminRouter.post(
  '/products/:productId/upload-image',
  upload.single('image'),
  uploadProductImageController
);

/**
 * @swagger
 * /api/admin/giftcards/reloadly/token-status:
 *   get:
 *     summary: Get Reloadly token status
 *     tags: [V2 - Admin - Gift Cards]
 *     description: |
 *       **V2 API** - Check Reloadly API access token status and expiration.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token status retrieved successfully
 */
giftCardAdminRouter.get('/reloadly/token-status', getReloadlyTokenStatusController);

/**
 * @swagger
 * /api/admin/giftcards/reloadly/refresh-token:
 *   post:
 *     summary: Refresh Reloadly access token
 *     tags: [V2 - Admin - Gift Cards]
 *     description: |
 *       **V2 API** - Manually refresh Reloadly API access token.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 */
giftCardAdminRouter.post('/reloadly/refresh-token', refreshReloadlyTokenController);

export default giftCardAdminRouter;

