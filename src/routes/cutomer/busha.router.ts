import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getBushaStatusController,
  getBushaProfileController,
  ensureBushaProfileController,
  getBushaKycStatusController,
  startBushaKycController,
  submitBushaKycController,
  verifyBushaKycController,
  getBushaWalletController,
  previewBushaSellController,
  executeBushaSellController,
  previewBushaBuyController,
  executeBushaBuyController,
  executeBushaReceiveController,
  previewBushaSendController,
  executeBushaSendController,
  listBushaTradesController,
  getBushaTradeController,
  refreshBushaTradeController,
} from '../../controllers/customer/busha.controller';

const router = Router();

router.get('/status', authenticateUser, getBushaStatusController);
router.get('/profile', authenticateUser, getBushaProfileController);
router.post('/profile/ensure', authenticateUser, ensureBushaProfileController);
router.post('/profile/refresh', authenticateUser, getBushaProfileController);

router.get('/kyc/status', authenticateUser, getBushaKycStatusController);
router.post('/kyc/start', authenticateUser, startBushaKycController);
router.post('/kyc/submit', authenticateUser, submitBushaKycController);
router.post('/kyc/verify', authenticateUser, verifyBushaKycController);

router.get('/wallet', authenticateUser, getBushaWalletController);

router.post('/sell/quote', authenticateUser, previewBushaSellController);
router.post('/sell/preview', authenticateUser, previewBushaSellController);
router.post('/sell', authenticateUser, executeBushaSellController);

router.post('/buy/quote', authenticateUser, previewBushaBuyController);
router.post('/buy/preview', authenticateUser, previewBushaBuyController);
router.post('/buy', authenticateUser, executeBushaBuyController);

router.post('/receive', authenticateUser, executeBushaReceiveController);

router.post('/send/preview', authenticateUser, previewBushaSendController);
router.post('/send', authenticateUser, executeBushaSendController);

router.get('/trades', authenticateUser, listBushaTradesController);
router.get('/trades/:id', authenticateUser, getBushaTradeController);
router.post('/trades/:id/refresh', authenticateUser, refreshBushaTradeController);

export default router;
