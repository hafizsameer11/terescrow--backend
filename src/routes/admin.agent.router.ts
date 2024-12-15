import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import { getAllChatsWithTeamController } from '../controllers/customer.agent.controllers';
import {
  sendMessageToTeamController,
  getTeamChatDetailsController,
} from '../controllers/agent.admin.controllers';

const adminAgentRouter = express.Router();

adminAgentRouter.get(
  '/get-all-teams-chats',
  authenticateUser,
  getAllChatsWithTeamController
);

adminAgentRouter.get(
  '/get-team-chat-details/:chatId',
  authenticateUser,
  getTeamChatDetailsController
);

adminAgentRouter.post(
  '/send-message-to-team',
  authenticateUser,
  sendMessageToTeamController
);

export default adminAgentRouter;
// adminAgentRouter.post('/create-crypto-transaction', authenticateUser,createTransactionCrypto)
// adminAgentRouter.post('/create-giftcard-transaction', authenticateUser,createTransactionCard)
// export default adminAgentRouter;
