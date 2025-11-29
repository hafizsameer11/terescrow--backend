/**
 * Support Chat Routes (Customer)
 * 
 * All customer-facing support chat endpoints
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  createSupportChatController,
  getSupportChatsController,
  getSupportChatByIdController,
  sendSupportChatMessageController,
  markMessagesAsReadController,
} from '../../controllers/customer/support.chat.controller';
import { body } from 'express-validator';

const supportChatRouter = express.Router();

// ============================================
// Support Chat Routes
// ============================================

/**
 * @swagger
 * /api/v2/support/chats:
 *   post:
 *     summary: Create a new support chat
 *     tags: [V2 - Support Chat]
 *     description: |
 *       **V2 API** - Create a new support chat with an initial message.
 *       
 *       **📋 Usage:**
 *       - User creates a support chat with a subject and initial message
 *       - Chat status starts as "pending"
 *       - Support agents can later assign themselves and respond
 *       
 *       **💡 Example Flow:**
 *       1. User creates chat: `POST /api/v2/support/chats` with subject and message
 *       2. Chat is created with status "pending"
 *       3. Support agent assigns and responds
 *       4. User can view chat: `GET /api/v2/support/chats/{chatId}`
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - initialMessage
 *             properties:
 *               subject:
 *                 type: string
 *                 example: "Support - Gift Cards"
 *                 description: Chat subject/title
 *               category:
 *                 type: string
 *                 example: "Gift Cards"
 *                 description: Optional category (e.g., "Gift Cards", "Crypto", "Bill Payments")
 *               initialMessage:
 *                 type: string
 *                 example: "I need help regarding gift cards"
 *                 description: Initial message to start the chat
 *     responses:
 *       201:
 *         description: Support chat created successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 */
supportChatRouter.post(
  '/chats',
  authenticateUser,
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('initialMessage').isString().notEmpty().withMessage('Initial message is required'),
    body('category').optional().isString(),
  ],
  createSupportChatController
);

/**
 * @swagger
 * /api/v2/support/chats:
 *   get:
 *     summary: Get user's support chats
 *     tags: [V2 - Support Chat]
 *     description: |
 *       **V2 API** - Get list of all support chats for the authenticated user.
 *       
 *       **📋 Usage:**
 *       - Returns all chats created by the authenticated user
 *       - Can filter by status: "pending", "processing", "completed"
 *       - Each chat includes the last message for preview
 *       
 *       **💡 Example Flow:**
 *       1. Get all chats: `GET /api/v2/support/chats`
 *       2. Filter by status: `GET /api/v2/support/chats?status=processing`
 *       3. View specific chat: `GET /api/v2/support/chats/{chatId}`
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed]
 *         description: Filter chats by status
 *         example: "processing"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *         description: Number of chats per page
 *     responses:
 *       200:
 *         description: Support chats retrieved successfully
 *       401:
 *         description: Unauthorized
 */
supportChatRouter.get('/chats', authenticateUser, getSupportChatsController);

/**
 * @swagger
 * /api/v2/support/chats/{chatId}:
 *   get:
 *     summary: Get support chat by ID with messages
 *     tags: [V2 - Support Chat]
 *     description: |
 *       **V2 API** - Get detailed information about a specific support chat including all messages.
 *       
 *       **📋 Usage:**
 *       - Get `chatId` from: `GET /api/v2/support/chats` (use `id` field from chats list)
 *       - Returns chat details and paginated messages
 *       - Messages are ordered by creation date (oldest first)
 *       
 *       **💡 Example Flow:**
 *       1. List chats: `GET /api/v2/support/chats` → Get `chatId: 123`
 *       2. View chat: `GET /api/v2/support/chats/123`
 *       3. Send message: `POST /api/v2/support/chats/123/messages`
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 123
 *         description: Support chat ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for messages pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *         description: Number of messages per page
 *     responses:
 *       200:
 *         description: Support chat retrieved successfully
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Unauthorized
 */
supportChatRouter.get('/chats/:chatId', authenticateUser, getSupportChatByIdController);

/**
 * @swagger
 * /api/v2/support/chats/{chatId}/messages:
 *   post:
 *     summary: Send a message in support chat
 *     tags: [V2 - Support Chat]
 *     description: |
 *       **V2 API** - Send a message in a support chat.
 *       
 *       **📋 Usage:**
 *       - User can send messages with `senderType: "user"`
 *       - Support agents can send messages with `senderType: "support"`
 *       - Chat status automatically changes to "processing" when support sends first message
 *       - Cannot send messages to completed chats
 *       
 *       **💡 Example Flow:**
 *       1. Get chat: `GET /api/v2/support/chats/{chatId}`
 *       2. Send message: `POST /api/v2/support/chats/{chatId}/messages`
 *       3. Refresh chat to see new message
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 123
 *         description: Support chat ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "I need help regarding gift cards"
 *                 description: Message content
 *               senderType:
 *                 type: string
 *                 enum: [user, support]
 *                 default: user
 *                 description: |
 *                   Sender type.
 *                   - "user" for customer messages
 *                   - "support" for agent messages (requires agent role)
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400:
 *         description: Validation failed or chat is completed
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Unauthorized
 */
supportChatRouter.post(
  '/chats/:chatId/messages',
  authenticateUser,
  [
    body('message').isString().notEmpty().withMessage('Message is required'),
    body('senderType').optional().isIn(['user', 'support']).withMessage('Invalid sender type'),
  ],
  sendSupportChatMessageController
);

/**
 * @swagger
 * /api/v2/support/chats/{chatId}/messages/read:
 *   put:
 *     summary: Mark messages as read
 *     tags: [V2 - Support Chat]
 *     description: |
 *       **V2 API** - Mark all unread support messages in a chat as read.
 *       
 *       **📋 Usage:**
 *       - Marks all unread support messages (from agents) as read
 *       - User messages are not affected
 *       
 *       **💡 Example Flow:**
 *       1. User opens chat: `GET /api/v2/support/chats/{chatId}`
 *       2. Mark as read: `PUT /api/v2/support/chats/{chatId}/messages/read`
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 123
 *         description: Support chat ID
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Unauthorized
 */
supportChatRouter.put('/chats/:chatId/messages/read', authenticateUser, markMessagesAsReadController);

export default supportChatRouter;

