import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  postFreezeController,
  postUnfreezeController,
  postBanController,
} from '../../controllers/admin/customers.freeze.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.post('/:customerId/freeze', ...adminOnly, postFreezeController);
router.post('/:customerId/unfreeze', ...adminOnly, postUnfreezeController);
router.post('/:customerId/ban', ...adminOnly, postBanController);

export default router;
