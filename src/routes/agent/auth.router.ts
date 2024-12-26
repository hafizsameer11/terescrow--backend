import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import { loginController } from '../../controllers/agent/agent.auth.controllers';

const agentauthRouter = express.Router();
agentauthRouter.post('/login',  loginController);
export default agentauthRouter;
