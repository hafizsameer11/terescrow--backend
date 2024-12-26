import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  createNote,
  createTransactionCard,
  createTransactionCrypto,
  deleteNote,
  editProfile,
  getAgentStats,
  getAgentTransactions,
  getAllNotes,
  getAllNotifications,
  getCustomerNotifications,
  getTeamNotification,
  getTransactionsForAgent,
  getTransactionsStatesForAgent,
  updateNote,
} from '../../controllers/agent/agent.operations.controllers';
import upload from '../../middlewares/multer.middleware';
import { getDefaultAgentChatsController, takeOverDefaultAgentChatController } from '../../controllers/agent/agent.chat.controllers';

const agentOperationsRouter = express.Router();

agentOperationsRouter.post(
  '/create-card-transaction',
  authenticateUser,
  createTransactionCard
);
agentOperationsRouter.post(
  '/create-crypto-transaction',
  authenticateUser,
  createTransactionCrypto
);
agentOperationsRouter.get('/get-agent-transactions', authenticateUser, getAgentTransactions);
agentOperationsRouter.get('/get-agent-stats', authenticateUser, getAgentStats);

agentOperationsRouter.get('/get-team-notifications', authenticateUser, getTeamNotification);
agentOperationsRouter.get('/get-customer-notifications', authenticateUser, getCustomerNotifications);
agentOperationsRouter.get('/get-all-notifications', authenticateUser, getAllNotifications);
agentOperationsRouter.get('/get-transactions-for-agent', authenticateUser, getTransactionsForAgent);
agentOperationsRouter.get('/get-transaction-stats-for-agent', authenticateUser, getTransactionsStatesForAgent);
agentOperationsRouter.post('/edit-agent-profile', upload.single('profilePicture'), authenticateUser, editProfile);


agentOperationsRouter.post('/create-note', authenticateUser, createNote);
agentOperationsRouter.post('/update-note/:id', authenticateUser, updateNote);
agentOperationsRouter.get('/get-notes/:id', authenticateUser, getAllNotes);
agentOperationsRouter.get('/delete-note/:id', authenticateUser, deleteNote);
agentOperationsRouter.get('/get-all-default-chats', authenticateUser, getDefaultAgentChatsController);
agentOperationsRouter.post('/take-over-chat/:chatId', authenticateUser, takeOverDefaultAgentChatController);
export default agentOperationsRouter;
