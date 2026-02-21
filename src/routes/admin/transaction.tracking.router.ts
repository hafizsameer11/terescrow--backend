import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getTransactionTrackingController,
  getTrackingStepsController,
  getTrackingDetailsController,
} from '../../controllers/admin/transaction.tracking.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, getTransactionTrackingController);
router.get('/:txId/steps', ...adminOnly, getTrackingStepsController);
router.get('/:txId/details', ...adminOnly, getTrackingDetailsController);

export default router;
