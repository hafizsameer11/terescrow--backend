import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  executeObiexBuyController,
  executeObiexConvertController,
  executeObiexSellController,
  executeObiexSendController,
  getObiexAssetsController,
  getObiexDepositAddressController,
  getObiexPublicRatesController,
  getObiexStatusController,
  getObiexTradeController,
  getObiexWalletController,
  listObiexTradesController,
  previewObiexBuyController,
  previewObiexConvertController,
  previewObiexSellController,
  previewObiexSendController,
} from '../../controllers/customer/obiex.controller';

const router = Router();

router.get('/status', authenticateUser, getObiexStatusController);
router.get('/rates/public', authenticateUser, getObiexPublicRatesController);
router.get('/wallet', authenticateUser, getObiexWalletController);
router.get('/assets', authenticateUser, getObiexAssetsController);
router.get('/deposit-address', authenticateUser, getObiexDepositAddressController);
router.post('/deposit-address', authenticateUser, getObiexDepositAddressController);

router.post('/buy/quote', authenticateUser, previewObiexBuyController);
router.post('/buy/preview', authenticateUser, previewObiexBuyController);
router.post('/buy', authenticateUser, executeObiexBuyController);

router.post('/sell/quote', authenticateUser, previewObiexSellController);
router.post('/sell/preview', authenticateUser, previewObiexSellController);
router.post('/sell', authenticateUser, executeObiexSellController);

router.post('/convert/preview', authenticateUser, previewObiexConvertController);
router.post('/convert/quote', authenticateUser, previewObiexConvertController);
router.post('/convert', authenticateUser, executeObiexConvertController);
router.post('/swap/preview', authenticateUser, previewObiexConvertController);
router.post('/swap', authenticateUser, executeObiexConvertController);

router.post('/send/preview', authenticateUser, previewObiexSendController);
router.post('/send', authenticateUser, executeObiexSendController);

router.get('/trades', authenticateUser, listObiexTradesController);
router.get('/trades/:id', authenticateUser, getObiexTradeController);

export default router;
