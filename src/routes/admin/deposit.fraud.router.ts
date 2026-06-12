import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import { listLockedDepositsController } from '../../controllers/admin/deposit.fraud.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/locked', ...adminOnly, listLockedDepositsController);

export default router;
