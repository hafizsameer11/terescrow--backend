import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllChatsWithCustomerController,
  sendToCustomerController,
  changeChatStatusController,
  getCustomerChatDetailsController,
} from '../../controllers/agent/agent.chat.controllers';
import upload from '../../middlewares/multer.middleware';

const agentChatRouter = express.Router();

/**
 * @swagger
 * /api/agent/send-to-customer:
 *   post:
 *     summary: Send message to customer
 *     tags: [Agent Chat]
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
agentChatRouter.post(
  '/send-to-customer',
  upload.single('image'),
  authenticateUser,
  sendToCustomerController
);

/**
 * @swagger
 * /api/agent/change-chat-status:
 *   post:
 *     summary: Change chat status
 *     tags: [Agent Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chatId
 *               - status
 *             properties:
 *               chatId:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [pending, successful, declined, unsuccessful]
 *     responses:
 *       200:
 *         description: Chat status updated successfully
 */
agentChatRouter.post(
  '/change-chat-status',
  authenticateUser,
  changeChatStatusController
);

/**
 * @swagger
 * /api/agent/get-all-chats-with-customer:
 *   get:
 *     summary: Get all agent-customer chats
 *     tags: [Agent Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Chats retrieved successfully
 */
agentChatRouter.get(
  '/get-all-chats-with-customer',
  authenticateUser,
  getAllChatsWithCustomerController
);

/**
 * @swagger
 * /api/agent/get-chat/{chatId}:
 *   get:
 *     summary: Get customer chat details
 *     tags: [Agent Chat]
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
agentChatRouter.get(
  '/get-chat/:chatId',
  authenticateUser,
  getCustomerChatDetailsController
);

export default agentChatRouter;
