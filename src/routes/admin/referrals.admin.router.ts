import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getReferralsSummaryController,
  getReferralsListController,
  getReferralsByUserController,
  getEarnSettingsController,
  putEarnSettingsController,
} from '../../controllers/admin/referrals.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/summary', ...adminOnly, getReferralsSummaryController);
router.get('/', ...adminOnly, getReferralsListController);
router.get('/by-user/:userId', ...adminOnly, getReferralsByUserController);
router.get('/earn-settings', ...adminOnly, getEarnSettingsController);
router.put('/earn-settings', ...adminOnly, putEarnSettingsController);

export default router;
