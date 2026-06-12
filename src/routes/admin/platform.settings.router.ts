import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getPlatformOperationSettingsController,
  putPlatformOperationSettingsController,
} from '../../controllers/admin/platform.operation.settings.controller';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/operation-controls', ...adminOnly, getPlatformOperationSettingsController);
router.put('/operation-controls', ...adminOnly, putPlatformOperationSettingsController);

export default router;
