import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { loginController } from '../../controllers/agent/agent.auth.controllers';

const agentauthRouter = express.Router();

/**
 * @swagger
 * /api/agent/auth/login:
 *   post:
 *     summary: Agent login
 *     tags: [Agent Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or phone number
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
agentauthRouter.post('/login',  loginController);
export default agentauthRouter;
