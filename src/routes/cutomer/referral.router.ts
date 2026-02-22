/**
 * Referral Routes (Customer)
 * 
 * Routes for referral code management, stats, earnings, and withdrawal
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getReferralCodeController,
  getReferralStatsController,
  getReferralEarningsController,
  withdrawReferralController,
} from '../../controllers/customer/referral.controller';

const referralRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Referrals
 *   description: Referral code, statistics, earnings, and withdrawal endpoints
 */

/**
 * @swagger
 * /api/v2/referrals/code:
 *   get:
 *     summary: Get user's referral code
 *     tags: [V2 - Referrals]
 *     x-order: 0
 *     description: Returns the user's referral code. If the user doesn't have one, it will be generated automatically.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral code retrieved successfully
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
 *       Returns referral code, statistics, earnings breakdown (level 1, level 2, signup bonuses),
 *       wallet balance, and list of referred users.
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     referralCode:
 *                       type: string
 *                     totalReferrals:
 *                       type: integer
 *                     earnings:
 *                       type: object
 *                       properties:
 *                         totalEarningsNaira:
 *                           type: number
 *                         level1Earnings:
 *                           type: number
 *                         level2Earnings:
 *                           type: number
 *                         signupBonuses:
 *                           type: number
 *                         walletBalance:
 *                           type: number
 *                         hasWithdrawn:
 *                           type: boolean
 *                     referredUsers:
 *                       type: array
 *                       items:
 *                         type: object
 */
referralRouter.get('/stats', authenticateUser, getReferralStatsController);

/**
 * @swagger
 * /api/v2/referrals/earnings:
 *   get:
 *     summary: Get referral earning history
 *     tags: [V2 - Referrals]
 *     x-order: 2
 *     description: Paginated list of all referral earnings (commissions, bonuses, overrides).
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
 *         description: Referral earnings retrieved successfully
 */
referralRouter.get('/earnings', authenticateUser, getReferralEarningsController);

/**
 * @swagger
 * /api/v2/referrals/withdraw:
 *   post:
 *     summary: Withdraw from referral wallet
 *     tags: [V2 - Referrals]
 *     x-order: 3
 *     description: |
 *       Withdraws funds from the referral wallet to the user's main NGN fiat wallet.
 *       First withdrawal requires a minimum balance of 20,000 NGN.
 *       Subsequent withdrawals have no minimum.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in NGN to withdraw
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *       400:
 *         description: Insufficient balance or minimum not met
 */
referralRouter.post('/withdraw', authenticateUser, withdrawReferralController);

export default referralRouter;
