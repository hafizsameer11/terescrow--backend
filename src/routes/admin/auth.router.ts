import express from 'express';
import upload from '../../middlewares/multer.middleware';
import { createAgentController, createTeamMember } from '../../controllers/admin/admin.utilities.controllers';
import authenticateUser from '../../middlewares/authenticate.user';

const adminAuthRouter = express.Router();

adminAuthRouter.post(
  '/create-agent',
  authenticateUser,
  upload.single('profilepicture'),
  createAgentController
);
adminAuthRouter.post('/create-team-member', authenticateUser, upload.single('profilepicture'), createTeamMember);

export default adminAuthRouter;
