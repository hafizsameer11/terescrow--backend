import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  createTransactionCard,
  createTransactionCrypto,
  editProfile,
  getAgentStats,
  getAgentTransactions,
  getAllNotifications,
  getCustomerNotifications,
  getTeamNotification,
  getTransactionsForAgent,
} from '../../controllers/agent/agent.operations.controllers';
import upload from '../../middlewares/multer.middleware';

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
agentOperationsRouter.get('/get-agent-transactions',authenticateUser,getAgentTransactions);
agentOperationsRouter.get('/get-agent-stats',authenticateUser,getAgentStats);

agentOperationsRouter.get('/get-team-notifications',authenticateUser,getTeamNotification);
agentOperationsRouter.get('/get-customer-notifications',authenticateUser,getCustomerNotifications);
agentOperationsRouter.get('/get-all-notifications',authenticateUser,getAllNotifications);
agentOperationsRouter.get('/get-transactions-for-agent',authenticateUser,getTransactionsForAgent);
agentOperationsRouter.post('/edit-agent-profile',upload.single('profilePicture'),authenticateUser,editProfile);
export default agentOperationsRouter;
