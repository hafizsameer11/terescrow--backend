/**
 * Referral Routes (Customer)
 * 
 * Routes for referral code management
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getReferralCodeController,
  getReferralStatsController,
} from '../../controllers/customer/referral.controller';

const referralRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Referrals
 *   description: Referral code and statistics endpoints
 */

/**
 * @swagger
 * /api/v2/referrals/code:
 *   get:
 *     summary: Get user's referral code
 *     tags: [V2 - Referrals]
 *     x-order: 0
 *     description: |
 *       Returns the user's referral code. If the user doesn't have one, it will be generated automatically.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral code retrieved successfully
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
 *                   example: "Referral code retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     referralCode:
 *                       type: string
 *                       example: "DEMSCR3ATIONS"
 */
referralRouter.get('/code', authenticateUser, getReferralCodeController);

/**
 * @swagger
 * /api/v2/referrals/stats:
 *   get:
 *     summary: Get referral statistics
 *     tags: [V2 - Referrals]
 *     x-order: 1
 *     description: |
 *       Returns referral code and statistics including total number of users referred and list of referred users.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral statistics retrieved successfully
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
 *                   example: "Referral statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     referralCode:
 *                       type: string
 *                       example: "DEMSCR3ATIONS"
 *                     totalReferrals:
 *                       type: integer
 *                       example: 14
 *                     referredUsers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           firstname:
 *                             type: string
 *                           lastname:
 *                             type: string
 *                           email:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 */
referralRouter.get('/stats', authenticateUser, getReferralStatsController);

export default referralRouter;

