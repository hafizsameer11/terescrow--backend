import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import authenticateAdminOrAgent from '../../middlewares/authenticate.admin.or.agent';
import {
  getAdminTransactionsController,
  getAdminTransactionsByCustomerController,
  getAdminTransactionStatsController,
  revokeCryptoTransactionController,
} from '../../controllers/admin/transactions.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];
const staffRead = [authenticateUser, authenticateAdminOrAgent];

router.get('/', ...staffRead, getAdminTransactionsController);
router.get('/stats', ...staffRead, getAdminTransactionStatsController);
router.get('/by-customer/:customerId', ...staffRead, getAdminTransactionsByCustomerController);
router.post('/crypto/:transactionId/revoke', ...adminOnly, revokeCryptoTransactionController);

export default router;
