import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllDepartmentsController,
  getCategoriesFromDepartment,
  getCountriesController,
  getSubCategoriesFromCatDepart,
  loginController,
} from '../controllers/public.controllers';
import { createTransactionCard, createTransactionCrypto, getTransactions } from '../controllers/customer.admin.agent.controllers';

const adminAgentRouter = express.Router();

adminAgentRouter.post('/create-crypto-transaction', authenticateUser,createTransactionCrypto)
adminAgentRouter.post('/create-giftcard-transaction', authenticateUser,createTransactionCard)
adminAgentRouter.get('/get-admin-transaction', authenticateUser,getTransactions)
export default adminAgentRouter;
