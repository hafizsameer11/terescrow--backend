import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatDetailsController,
  sendMessageController,
} from '../../controllers/customer/chat.controllers';

const customerRouter = express.Router();

customerRouter.post('/send-message', authenticateUser, sendMessageController);

customerRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getChatDetailsController
);

customerRouter.get('/get-all-chats', authenticateUser, getAllChatsController);

export default customerRouter;
