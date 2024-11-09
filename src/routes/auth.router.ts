import express from 'express';
import {
  loginController,
  logoutController,
  registerController,
} from '../controllers/auth.controllers';
// import authController from '../controllers/auth.controller';
const authRouter = express.Router();

authRouter.post('/login', loginController);
authRouter.post('/register', registerController);
authRouter.post('/logout', logoutController);

export default authRouter;
