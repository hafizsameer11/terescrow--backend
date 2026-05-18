import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getFailedCryptoJobsController,
  retryCryptoJobController,
} from '../../controllers/admin/crypto.jobs.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/failed', ...adminOnly, getFailedCryptoJobsController);
router.post('/retry', ...adminOnly, retryCryptoJobController);

export default router;
