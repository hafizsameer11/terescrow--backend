import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { createChatGroupController } from '../../controllers/admin/admin.chat.controllers';

const adminChatRouter = express.Router();

/**
 * @swagger
 * /api/admin/create-chat-group:
 *   post:
 *     summary: Create a team chat group
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               groupName:
 *                 type: string
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Chat group created successfully
 */
adminChatRouter.post(
  '/create-chat-group',
  authenticateUser,
  createChatGroupController
);


export default adminChatRouter;
