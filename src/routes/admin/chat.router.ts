import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { createChatGroupController } from '../../controllers/admin/admin.chat.controllers';

const adminChatRouter = express.Router();

adminChatRouter.post(
  '/create-chat-group',
  authenticateUser,
  createChatGroupController
);


export default adminChatRouter;
