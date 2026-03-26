import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getChangeNowCurrenciesController,
  getInternalTickerMapController,
  putTickerMappingController,
  getQuoteController,
  getAvailablePairsController,
  getNetworkFeeController,
  listPartnerExchangesController,
  listPayoutAddressesController,
  createPayoutAddressController,
  updatePayoutAddressController,
  deletePayoutAddressController,
  createSwapController,
  listSwapsController,
  getSwapController,
  refreshSwapController,
} from '../../controllers/admin/changenow.admin.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/currencies', ...adminOnly, getChangeNowCurrenciesController);
router.get('/map-internal', ...adminOnly, getInternalTickerMapController);
router.put('/ticker-mappings/:walletCurrencyId', ...adminOnly, putTickerMappingController);
router.get('/quote', ...adminOnly, getQuoteController);
router.get('/available-pairs', ...adminOnly, getAvailablePairsController);
router.get('/network-fee', ...adminOnly, getNetworkFeeController);
router.get('/partner-exchanges', ...adminOnly, listPartnerExchangesController);

router.get('/payout-addresses', ...adminOnly, listPayoutAddressesController);
router.post('/payout-addresses', ...adminOnly, createPayoutAddressController);
router.patch('/payout-addresses/:id', ...adminOnly, updatePayoutAddressController);
router.delete('/payout-addresses/:id', ...adminOnly, deletePayoutAddressController);

router.post('/swaps', ...adminOnly, createSwapController);
router.get('/swaps', ...adminOnly, listSwapsController);
router.get('/swaps/:id', ...adminOnly, getSwapController);
router.post('/swaps/:id/refresh', ...adminOnly, refreshSwapController);

export default router;
