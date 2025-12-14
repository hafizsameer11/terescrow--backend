/**
 * Webhook Migration Routes (Admin)
 * 
 * Routes for migrating webhook subscriptions
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { migrateWebhookSubscriptionsController } from '../../controllers/admin/webhook.migration.controller';

const webhookMigrationRouter = express.Router();

// All routes require authentication
webhookMigrationRouter.use(authenticateUser);

/**
 * @swagger
 * /api/admin/webhooks/migrate-subscriptions:
 *   post:
 *     summary: Migrate webhook subscriptions for all existing deposit addresses
 *     tags: [Admin - Webhook Migration]
 *     description: |
 *       Migrates webhook subscriptions from ADDRESS_EVENT to the new subscription types:
 *       - INCOMING_NATIVE_TX (for all blockchains)
 *       - INCOMING_FUNGIBLE_TX (for blockchains that support tokens like Ethereum, Tron, BSC)
 *       
 *       This command registers new subscriptions for all existing deposit addresses.
 *       Existing ADDRESS_EVENT subscriptions can remain (Tatum will send both old and new webhooks).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Webhook subscription migration completed
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 150
 *                         successful:
 *                           type: number
 *                           example: 148
 *                         failed:
 *                           type: number
 *                           example: 2
 *                         skipped:
 *                           type: number
 *                           example: 5
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               address:
 *                                 type: string
 *                               blockchain:
 *                                 type: string
 *                               error:
 *                                 type: string
 *       500:
 *         description: Migration failed
 */
webhookMigrationRouter.post('/migrate-subscriptions', migrateWebhookSubscriptionsController);

export default webhookMigrationRouter;

