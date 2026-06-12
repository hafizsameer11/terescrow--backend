import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getDepositVerificationLogController,
  listDepositVerificationLogsController,
  retryDepositVerificationController,
} from '../../controllers/admin/deposit.verification.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/logs', ...adminOnly, listDepositVerificationLogsController);
router.get('/logs/:id', ...adminOnly, getDepositVerificationLogController);
router.post('/logs/:id/retry', ...adminOnly, retryDepositVerificationController);

export default router;
