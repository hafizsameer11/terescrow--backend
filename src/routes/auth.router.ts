import express from 'express';
import {
  loginController,
  logoutController,
  registerController,
  resendOtpController,
  verifyUserController,
} from '../controllers/auth.controllers';
import authenticateUser from '../middlewares/authenticate.user';
// import authController from '../controllers/auth.controller';
const authRouter = express.Router();

authRouter.post('/login', loginController);
authRouter.post('/register', registerController);
authRouter.post('/logout', logoutController);
authRouter.post('/verify-otp', authenticateUser, verifyUserController);
authRouter.post('/resend-otp', authenticateUser, resendOtpController);

export default authRouter;
