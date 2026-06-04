import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getAdminUserBalancesController,
  getAdminUserBalancesSummaryController,
  getAdminUserAssetBalancesController,
  getAdminUserWalletDetailController,
  transferOnChainSurplusController,
} from '../../controllers/admin/user.balances.controller';

const router = express.Router();

router.post(
  '/:userId/transfer-surplus',
  authenticateUser,
  authenticateAdmin,
  transferOnChainSurplusController
);

router.get(
  '/:userId/detail',
  authenticateUser,
  authenticateAdmin,
  getAdminUserWalletDetailController
);

router.get(
  '/:userId/assets',
  authenticateUser,
  authenticateAdmin,
  getAdminUserAssetBalancesController
);

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
