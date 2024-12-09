import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsWithCustomerController,
  getAllChatsWithTeamController,
  sendToCustomerController,
  sendToTeamController,
  getChatDetailsController,
} from '../../controllers/agent/agent.chat.controllers';

const agentChatRouter = express.Router();

agentChatRouter.post(
  '/send-to-customer',
  authenticateUser,
  sendToCustomerController
);
agentChatRouter.post('/send-to-team', authenticateUser, sendToTeamController);
agentChatRouter.get(
  '/get-all-chats-with-customer',
  authenticateUser,
  getAllChatsWithCustomerController
);
agentChatRouter.get(
  '/get-all-chats-with-team',
  authenticateUser,
  getAllChatsWithTeamController
);
agentChatRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getChatDetailsController
);

export default agentChatRouter;
