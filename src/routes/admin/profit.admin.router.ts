import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  backfillProfitLedgerController,
  createDiscountTierController,
  createProfitConfigController,
  createRateConfigController,
  getProfitConfigsController,
  getProfitLedgerController,
  getProfitStatsController,
  previewProfitController,
  reconcileProfitLedgerController,
  updateDiscountTierController,
  updateProfitConfigController,
  updateRateConfigController,
} from '../../controllers/admin/profit.admin.controller';

const profitAdminRouter = Router();

profitAdminRouter.get('/configs', authenticateUser, getProfitConfigsController);
profitAdminRouter.post('/configs/profit', authenticateUser, createProfitConfigController);
profitAdminRouter.put('/configs/profit/:id', authenticateUser, updateProfitConfigController);
profitAdminRouter.post('/configs/rate', authenticateUser, createRateConfigController);
profitAdminRouter.put('/configs/rate/:id', authenticateUser, updateRateConfigController);
profitAdminRouter.post('/configs/discount-tier', authenticateUser, createDiscountTierController);
profitAdminRouter.put('/configs/discount-tier/:id', authenticateUser, updateDiscountTierController);
profitAdminRouter.post('/preview', authenticateUser, previewProfitController);

profitAdminRouter.get('/ledger', authenticateUser, getProfitLedgerController);
profitAdminRouter.get('/stats', authenticateUser, getProfitStatsController);
profitAdminRouter.post('/backfill', authenticateUser, backfillProfitLedgerController);
profitAdminRouter.get('/reconcile', authenticateUser, reconcileProfitLedgerController);

export default profitAdminRouter;
