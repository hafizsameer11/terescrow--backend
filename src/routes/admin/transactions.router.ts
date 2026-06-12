import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getAdminTransactionsController,
  getAdminTransactionsByCustomerController,
  getAdminTransactionStatsController,
  revokeCryptoTransactionController,
} from '../../controllers/admin/transactions.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, getAdminTransactionsController);
router.get('/stats', ...adminOnly, getAdminTransactionStatsController);
router.get('/by-customer/:customerId', ...adminOnly, getAdminTransactionsByCustomerController);
router.post('/crypto/:transactionId/revoke', ...adminOnly, revokeCryptoTransactionController);

export default router;
