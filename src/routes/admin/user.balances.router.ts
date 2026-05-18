import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getAdminUserBalancesController,
  getAdminUserBalancesSummaryController,
} from '../../controllers/admin/user.balances.controller';

const router = express.Router();

router.get(
  '/summary',
  authenticateUser,
  authenticateAdmin,
  getAdminUserBalancesSummaryController
);

router.get(
  '/',
  authenticateUser,
  authenticateAdmin,
  getAdminUserBalancesController
);

export default router;
