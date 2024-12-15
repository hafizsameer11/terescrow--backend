import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsWithCustomerController,
  sendToCustomerController,
  changeChatStatusController,
  getCustomerChatDetailsController,
} from '../../controllers/agent/agent.chat.controllers';

const agentChatRouter = express.Router();

agentChatRouter.post(
  '/send-to-customer',
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
