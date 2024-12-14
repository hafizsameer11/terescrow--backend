import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsWithCustomerController,
  sendToCustomerController,
  sendToTeamController,
  getChatDetailsController,
  changeChatStatusController,
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

agentChatRouter.post('/send-to-team', authenticateUser, sendToTeamController);

agentChatRouter.get(
  '/get-all-chats-with-customer',
  authenticateUser,
  getAllChatsWithCustomerController
);

agentChatRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getChatDetailsController
);

export default agentChatRouter;
