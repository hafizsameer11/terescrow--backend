import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getVendorsController,
  createVendorController,
  updateVendorController,
  deleteVendorController,
} from '../../controllers/admin/vendors.controller';
import { body } from 'express-validator';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/', ...adminOnly, getVendorsController);
router.post(
  '/',
  ...adminOnly,
  [
    body('name').isString().notEmpty(),
    body('network').isString().notEmpty(),
    body('currency').isString().notEmpty(),
    body('walletAddress').isString().notEmpty(),
    body('notes').optional().isString(),
  ],
  createVendorController
);
router.patch('/:id', ...adminOnly, updateVendorController);
router.delete('/:id', ...adminOnly, deleteVendorController);

export default router;
