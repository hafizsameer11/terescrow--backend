import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllDepartmentsController,
  getCategoriesFromDepartment,
  getCountriesController,
  getSubCategoriesFromCatDepart,
  loginController,
} from '../controllers/public.controllers';
import { createTransactionCard, createTransactionCrypto } from '../controllers/customer.admin.agent.controllers';

const adminAgentRouter = express.Router();

adminAgentRouter.post('/create-crypto-transaction', authenticateUser,createTransactionCrypto)
adminAgentRouter.post('/create-giftcard-transaction', authenticateUser,createTransactionCard)
export default adminAgentRouter;
