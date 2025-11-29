import express from 'express';
import upload from '../../middlewares/multer.middleware';
import { createAgentController, createTeamMember } from '../../controllers/admin/admin.utilities.controllers';
import authenticateUser from '../../middlewares/authenticate.user';

const adminAuthRouter = express.Router();

/**
 * @swagger
 * /api/admin/create-agent:
 *   post:
 *     summary: Create a new agent
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phoneNumber
 *               - password
 *               - username
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *               gender:
 *                 type: integer
 *               country:
 *                 type: string
 *               profilepicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Agent created successfully
 *       400:
 *         description: Validation error
 */
adminAuthRouter.post(
  '/create-agent',
  authenticateUser,
  upload.single('profilepicture'),
  createAgentController
);

/**
 * @swagger
 * /api/admin/create-team-member:
 *   post:
 *     summary: Create a team member
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *               profilepicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Team member created successfully
 */
adminAuthRouter.post('/create-team-member', authenticateUser, upload.single('profilepicture'), createTeamMember);

export default adminAuthRouter;
