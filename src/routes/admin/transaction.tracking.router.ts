import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdminOrAgent from '../../middlewares/authenticate.admin.or.agent';
import {
  getTransactionTrackingController,
  getTrackingStepsController,
  getTrackingDetailsController,
  sendReceivedAssetToVendorController,
  sendReceivedAssetToMasterWalletController,
  bulkSendReceivedAssetsToVendorController,
  estimateDisbursementFeeController,
} from '../../controllers/admin/transaction.tracking.controller';

const router = express.Router();
const staffOps = [authenticateUser, authenticateAdminOrAgent];

router.get('/', ...staffOps, getTransactionTrackingController);
router.post('/bulk-send-to-vendor', ...staffOps, bulkSendReceivedAssetsToVendorController);
router.get('/:txId/steps', ...staffOps, getTrackingStepsController);
router.get('/:txId/details', ...staffOps, getTrackingDetailsController);
router.get('/:txId/estimate-fee', ...staffOps, estimateDisbursementFeeController);
router.post('/:txId/send-to-vendor', ...staffOps, sendReceivedAssetToVendorController);
router.post('/:txId/send-to-master-wallet', ...staffOps, sendReceivedAssetToMasterWalletController);

export default router;
