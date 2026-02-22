import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getReferralsSummaryController,
  getReferralsListController,
  getReferralsByUserController,
  getEarnSettingsController,
  putEarnSettingsController,
  getCommissionSettingsController,
  upsertCommissionSettingController,
  getUserOverridesController,
  upsertUserOverrideController,
  deleteUserOverrideController,
} from '../../controllers/admin/referrals.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

// Existing
router.get('/summary', ...adminOnly, getReferralsSummaryController);
router.get('/', ...adminOnly, getReferralsListController);
router.get('/by-user/:userId', ...adminOnly, getReferralsByUserController);

// Legacy earn settings (backward compat)
router.get('/earn-settings', ...adminOnly, getEarnSettingsController);
router.put('/earn-settings', ...adminOnly, putEarnSettingsController);

// New per-service commission settings
router.get('/commission-settings', ...adminOnly, getCommissionSettingsController);
router.put('/commission-settings', ...adminOnly, upsertCommissionSettingController);

// Per-user overrides (influencers)
router.get('/user-override/:userId', ...adminOnly, getUserOverridesController);
router.put('/user-override/:userId', ...adminOnly, upsertUserOverrideController);
router.delete('/user-override/:userId/:service', ...adminOnly, deleteUserOverrideController);

export default router;
