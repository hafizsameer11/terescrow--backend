import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getMerchantsOverviewController,
  getStroWalletConfigController,
  putStroWalletConfigController,
  topUpStroWalletController,
  getPalmpayBanksForMerchantsController,
  verifyPalmpayBankForMerchantsController,
} from '../../controllers/admin/merchants.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, getMerchantsOverviewController);
router.get('/palmpay/banks', ...adminOnly, getPalmpayBanksForMerchantsController);
router.post('/palmpay/verify-account', ...adminOnly, verifyPalmpayBankForMerchantsController);

router.get('/strowallet/config', ...adminOnly, getStroWalletConfigController);
router.put('/strowallet/config', ...adminOnly, putStroWalletConfigController);
router.post('/strowallet/topup', ...adminOnly, topUpStroWalletController);

export default router;
