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
  prepareBushaSellPalmpayPayoutController,
  executeBushaBuyController,
  executeBushaSellController,
  executeBushaCryptoReceiveController,
  executeBushaCryptoSendController,
  getBushaCustomerWalletController,
  getBushaCustomerBalanceController,
  listBushaCustomerTransfersController,
  getBushaCustomerTransferController,
  getBushaCustomerQuoteController,
  listBushaCustomerRecipientsController,
  listBushaTradesController,
  getBushaTradeController,
  refreshBushaTradeController,
  listBushaCustomerWalletsController,
  getBushaCustomerWalletOverviewController,
  listBushaMarkupRangesController,
  createBushaMarkupRangeController,
  updateBushaMarkupRangeController,
  deleteBushaMarkupRangeController,
} from '../../controllers/admin/busha.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/status', ...adminOnly, getBushaStatusController);
router.put('/settings', ...adminOnly, putBushaSettingsController);
router.get('/markup-ranges', ...adminOnly, listBushaMarkupRangesController);
router.post('/markup-ranges', ...adminOnly, createBushaMarkupRangeController);
router.put('/markup-ranges/:id', ...adminOnly, updateBushaMarkupRangeController);
router.delete('/markup-ranges/:id', ...adminOnly, deleteBushaMarkupRangeController);
router.post('/recipients/sync', ...adminOnly, syncBushaRecipientController);

router.get('/customer-wallets', ...adminOnly, listBushaCustomerWalletsController);
router.get('/customer-wallets/:id', ...adminOnly, getBushaCustomerWalletOverviewController);

router.get('/customers', ...adminOnly, listBushaCustomersController);
router.post('/customers', ...adminOnly, createBushaCustomerController);
router.get('/customers/:id', ...adminOnly, getBushaCustomerController);
router.put('/customers/:id/kyc', ...adminOnly, submitBushaCustomerKycController);
router.post('/customers/:id/kyc', ...adminOnly, submitBushaCustomerKycController);
router.post('/customers/:id/verify', ...adminOnly, verifyBushaCustomerController);
router.post('/customers/:id/refresh', ...adminOnly, refreshBushaCustomerController);
router.get('/customers/:id/wallet', ...adminOnly, getBushaCustomerWalletController);
router.get('/customers/:id/balances/:currency', ...adminOnly, getBushaCustomerBalanceController);
router.get('/customers/:id/transfers', ...adminOnly, listBushaCustomerTransfersController);
router.get('/customers/:id/transfers/:transferId', ...adminOnly, getBushaCustomerTransferController);
router.get('/customers/:id/quotes/:quoteId', ...adminOnly, getBushaCustomerQuoteController);
router.get('/customers/:id/recipients', ...adminOnly, listBushaCustomerRecipientsController);

router.post('/quote/preview', ...adminOnly, previewBushaQuoteController);
router.post('/sell/prepare-palmpay-payout', ...adminOnly, prepareBushaSellPalmpayPayoutController);
router.post('/trades/buy', ...adminOnly, executeBushaBuyController);
router.post('/trades/sell', ...adminOnly, executeBushaSellController);
router.post('/trades/crypto/receive', ...adminOnly, executeBushaCryptoReceiveController);
router.post('/trades/crypto/send', ...adminOnly, executeBushaCryptoSendController);
router.get('/trades', ...adminOnly, listBushaTradesController);
router.get('/trades/:id', ...adminOnly, getBushaTradeController);
router.post('/trades/:id/refresh', ...adminOnly, refreshBushaTradeController);

export default router;
