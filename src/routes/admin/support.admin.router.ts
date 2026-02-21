import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import upload from '../../middlewares/multer.middleware';
import {
  getAdminSupportChatsController,
  getAdminSupportChatMessagesController,
  postAdminSupportChatMessageController,
  patchAdminSupportChatController,
} from '../../controllers/admin/support.admin.controller';
import { body } from 'express-validator';

const router = express.Router();
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/chats', ...adminOnly, getAdminSupportChatsController);
router.get('/chats/:chatId/messages', ...adminOnly, getAdminSupportChatMessagesController);
router.post(
  '/chats/:chatId/messages',
  ...adminOnly,
  upload.single('image'),
  [body('text').optional().isString()],
  postAdminSupportChatMessageController
);
router.patch('/chats/:chatId', ...adminOnly, patchAdminSupportChatController);

export default router;
