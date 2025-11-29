import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsController,
  getChatDetailsController,
  sendMessageController,
} from '../../controllers/customer/chat.controllers';
import upload from '../../middlewares/multer.middleware';

const customerRouter = express.Router();

/**
 * @swagger
 * /api/customer/send-message:
 *   post:
 *     summary: Send message in chat
 *     tags: [Customer Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - chatId
 *             properties:
 *               chatId:
 *                 type: integer
 *               message:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Message sent successfully
 */
customerRouter.post('/send-message', upload.single('image'), authenticateUser, sendMessageController);

/**
 * @swagger
 * /api/customer/get-chat/{chatId}:
 *   get:
 *     summary: Get chat details and messages
 *     tags: [Customer Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat details retrieved successfully
 */
customerRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getChatDetailsController
);

/**
 * @swagger
 * /api/customer/get-all-chats:
 *   get:
 *     summary: Get all customer chats
 *     tags: [Customer Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Chats retrieved successfully
 */
customerRouter.get('/get-all-chats', authenticateUser, getAllChatsController);

export default customerRouter;
