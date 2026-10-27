import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  listHeldVaDepositsController,
  approveHeldVaDepositController,
  rejectHeldVaDepositController,
} from '../../controllers/admin/va.deposit.review.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

/** GET /api/admin/va-deposit-review/held */
router.get('/held', ...adminOnly, listHeldVaDepositsController);

/** POST /api/admin/va-deposit-review/:id/approve  body: { note? } */
router.post('/:id/approve', ...adminOnly, approveHeldVaDepositController);

/** POST /api/admin/va-deposit-review/:id/reject  body: { note? } */
router.post('/:id/reject', ...adminOnly, rejectHeldVaDepositController);

export default router;
