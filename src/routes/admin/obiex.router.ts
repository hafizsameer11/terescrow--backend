import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  deleteObiexMarkupRangeController,
  getObiexAdminStatusController,
  getObiexTradeReconController,
  listObiexCurrencyMapsController,
  listObiexMarkupRangesController,
  listObiexReconMismatchesController,
  putObiexSettingsController,
  upsertObiexMarkupRangeController,
} from '../../controllers/admin/obiex.controller';

const router = express.Router();

router.get('/status', authenticateUser, authenticateAdmin, getObiexAdminStatusController);
router.put('/settings', authenticateUser, authenticateAdmin, putObiexSettingsController);
router.get('/markup-ranges', authenticateUser, authenticateAdmin, listObiexMarkupRangesController);
router.post('/markup-ranges', authenticateUser, authenticateAdmin, upsertObiexMarkupRangeController);
router.put('/markup-ranges/:id', authenticateUser, authenticateAdmin, async (req, res, next) => {
  req.body = { ...(req.body || {}), id: Number(req.params.id) };
  return upsertObiexMarkupRangeController(req, res, next);
});
router.delete(
  '/markup-ranges/:id',
  authenticateUser,
  authenticateAdmin,
  deleteObiexMarkupRangeController
);
router.get(
  '/currency-map',
  authenticateUser,
  authenticateAdmin,
  listObiexCurrencyMapsController
);
router.get(
  '/reconciliations/mismatches',
  authenticateUser,
  authenticateAdmin,
  listObiexReconMismatchesController
);
router.get(
  '/trades/:tradeId/reconciliation',
  authenticateUser,
  authenticateAdmin,
  getObiexTradeReconController
);

export default router;
