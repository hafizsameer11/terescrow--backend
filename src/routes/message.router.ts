import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatController,
  sendMessageController,
} from '../controllers/message.controllers';

const messageRouter = express.Router();

messageRouter.post('/send-message', authenticateUser, sendMessageController);

messageRouter.get('/get-chat/:chatId', authenticateUser, getChatController);

messageRouter.get('/get-all-chats', authenticateUser, getAllChatsController);

export default messageRouter;
