import express from 'express';
import upload from '../../middlewares/multer.middleware';
import { createAgentController } from '../../controllers/admin/admin.utilities.controllers';
import authenticateUser from '../../middlewares/authenticate.user';

const adminAuthRouter = express.Router();

adminAuthRouter.post(
  '/create-agent',
  authenticateUser,
  upload.single('profilepicture'),
  createAgentController
);

export default adminAuthRouter;
