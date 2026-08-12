import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getBushaStatusController,
  putBushaSettingsController,
  syncBushaRecipientController,
  listBushaCustomersController,
  getBushaCustomerController,
  createBushaCustomerController,
  submitBushaCustomerKycController,
  verifyBushaCustomerController,
  refreshBushaCustomerController,
  previewBushaQuoteController,
  executeBushaBuyController,
  executeBushaSellController,
  executeBushaCryptoReceiveController,
  executeBushaCryptoSendController,
  listBushaTradesController,
  getBushaTradeController,
  refreshBushaTradeController,
} from '../../controllers/admin/busha.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/status', ...adminOnly, getBushaStatusController);
router.put('/settings', ...adminOnly, putBushaSettingsController);
router.post('/recipients/sync', ...adminOnly, syncBushaRecipientController);

router.get('/customers', ...adminOnly, listBushaCustomersController);
router.post('/customers', ...adminOnly, createBushaCustomerController);
router.get('/customers/:id', ...adminOnly, getBushaCustomerController);
router.put('/customers/:id/kyc', ...adminOnly, submitBushaCustomerKycController);
router.post('/customers/:id/kyc', ...adminOnly, submitBushaCustomerKycController);
router.post('/customers/:id/verify', ...adminOnly, verifyBushaCustomerController);
router.post('/customers/:id/refresh', ...adminOnly, refreshBushaCustomerController);

router.post('/quote/preview', ...adminOnly, previewBushaQuoteController);
router.post('/trades/buy', ...adminOnly, executeBushaBuyController);
router.post('/trades/sell', ...adminOnly, executeBushaSellController);
router.post('/trades/crypto/receive', ...adminOnly, executeBushaCryptoReceiveController);
router.post('/trades/crypto/send', ...adminOnly, executeBushaCryptoSendController);
router.get('/trades', ...adminOnly, listBushaTradesController);
router.get('/trades/:id', ...adminOnly, getBushaTradeController);
router.post('/trades/:id/refresh', ...adminOnly, refreshBushaTradeController);

export default router;
