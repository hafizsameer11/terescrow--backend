import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import { getAdminTransactionsController } from '../../controllers/admin/transactions.admin.controller';

const router = express.Router();

router.get(
  '/',
  authenticateUser,
  authenticateAdmin,
  getAdminTransactionsController
);

export default router;
