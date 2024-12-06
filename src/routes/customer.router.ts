import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllChatsController,
  getCategoriesController,
  getChatController,
  getCountriesController,
  getDepartmentsController,
  getSubCategoriesController,
  sendMessageController,
} from '../controllers/customer.controllers';

const customerRouter = express.Router();

customerRouter.get('/departments', authenticateUser, getDepartmentsController);

customerRouter.get(
  '/categories/:departmentId',
  authenticateUser,
  getCategoriesController
);

customerRouter.get(
  '/subcategories',
  authenticateUser,
  getSubCategoriesController
);

customerRouter.get('/countries', authenticateUser, getCountriesController);

customerRouter.post('/send-message', authenticateUser, sendMessageController);

customerRouter.get('/get-chat/:chatId', authenticateUser, getChatController);

customerRouter.get('/get-all-chats', authenticateUser, getAllChatsController);

export default customerRouter;
