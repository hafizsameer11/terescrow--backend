import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatDetailsController,
  sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { getTransactionBydepartment, getTransactionGroupData } from '../../controllers/customer/utilities.controller';

const customerUtilityrouter = express.Router();

customerUtilityrouter.get('/get-transaction-group',authenticateUser,getTransactionGroupData);
customerUtilityrouter.get('/get-transaction-by-department/:id',authenticateUser,getTransactionBydepartment);
// customerUtilityrouter.post()
export default customerUtilityrouter;
