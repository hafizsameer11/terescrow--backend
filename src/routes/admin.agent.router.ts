import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import { getAllChatsWithTeamController } from '../controllers/customer.agent.controllers';

const adminAgentRouter = express.Router();

adminAgentRouter.get(
  '/get-all-teams-chats',
  authenticateUser,
  getAllChatsWithTeamController
);

export default adminAgentRouter;
// adminAgentRouter.post('/create-crypto-transaction', authenticateUser,createTransactionCrypto)
// adminAgentRouter.post('/create-giftcard-transaction', authenticateUser,createTransactionCard)
// export default adminAgentRouter;
