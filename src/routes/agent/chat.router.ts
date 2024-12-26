import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsWithCustomerController,
  sendToCustomerController,
  changeChatStatusController,
  getCustomerChatDetailsController,
} from '../../controllers/agent/agent.chat.controllers';
import upload from '../../middlewares/multer.middleware';

const agentChatRouter = express.Router();

agentChatRouter.post(
  '/send-to-customer',
  upload.single('image'),
  authenticateUser,
  sendToCustomerController
);

agentChatRouter.post(
  '/change-chat-status',
  authenticateUser,
  changeChatStatusController
);

agentChatRouter.get(
  '/get-all-chats-with-customer',
  authenticateUser,
  getAllChatsWithCustomerController
);

agentChatRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getCustomerChatDetailsController
);

export default agentChatRouter;
