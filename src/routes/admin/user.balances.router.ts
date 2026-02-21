import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import { getAdminUserBalancesController } from '../../controllers/admin/user.balances.controller';

const router = express.Router();

router.get(
  '/',
  authenticateUser,
  authenticateAdmin,
  getAdminUserBalancesController
);

export default router;
