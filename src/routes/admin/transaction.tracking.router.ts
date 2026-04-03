import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getTransactionTrackingController,
  getTrackingStepsController,
  getTrackingDetailsController,
  sendReceivedAssetToVendorController,
  sendReceivedAssetToMasterWalletController,
  bulkSendReceivedAssetsToVendorController,
} from '../../controllers/admin/transaction.tracking.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, getTransactionTrackingController);
router.post('/bulk-send-to-vendor', ...adminOnly, bulkSendReceivedAssetsToVendorController);
router.get('/:txId/steps', ...adminOnly, getTrackingStepsController);
router.get('/:txId/details', ...adminOnly, getTrackingDetailsController);
router.post('/:txId/send-to-vendor', ...adminOnly, sendReceivedAssetToVendorController);
router.post('/:txId/send-to-master-wallet', ...adminOnly, sendReceivedAssetToMasterWalletController);

export default router;
