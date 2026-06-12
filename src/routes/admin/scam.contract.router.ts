import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  addScamContractController,
  listScamContractsController,
} from '../../controllers/admin/scam.contract.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, listScamContractsController);
router.post('/', ...adminOnly, addScamContractController);

export default router;
