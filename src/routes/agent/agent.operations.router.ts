import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  createTransactionCard,
  createTransactionCrypto,
  getAgentStats,
  getAgentTransactions,
} from '../../controllers/agent/agent.operations.controllers';

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
export default agentOperationsRouter;
