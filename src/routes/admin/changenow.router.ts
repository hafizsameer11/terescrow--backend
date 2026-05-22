import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import authenticateAdminOrAgent from '../../middlewares/authenticate.admin.or.agent';
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
const staffOps = [authenticateUser, authenticateAdminOrAgent];

router.get('/currencies', ...staffOps, getChangeNowCurrenciesController);
router.get('/map-internal', ...staffOps, getInternalTickerMapController);
router.put('/ticker-mappings/:walletCurrencyId', ...adminOnly, putTickerMappingController);
router.get('/quote', ...staffOps, getQuoteController);
router.get('/available-pairs', ...staffOps, getAvailablePairsController);
router.get('/network-fee', ...staffOps, getNetworkFeeController);
router.get('/partner-exchanges', ...staffOps, listPartnerExchangesController);

router.get('/payout-addresses', ...staffOps, listPayoutAddressesController);
router.post('/payout-addresses', ...adminOnly, createPayoutAddressController);
router.patch('/payout-addresses/:id', ...adminOnly, updatePayoutAddressController);
router.delete('/payout-addresses/:id', ...adminOnly, deletePayoutAddressController);

router.post('/swaps', ...staffOps, createSwapController);
router.get('/swaps', ...staffOps, listSwapsController);
router.get('/swaps/:id', ...staffOps, getSwapController);
router.post('/swaps/:id/refresh', ...staffOps, refreshSwapController);

export default router;
