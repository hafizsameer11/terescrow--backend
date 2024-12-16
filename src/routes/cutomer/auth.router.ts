import express from 'express';
import {
  editProfileController,
  logoutController,
  registerCustomerController,
  resendOtpController,
  sendPasswordOtpController,
  verifyForgotPasswordOtp,
  verifyUserController,
} from '../../controllers/customer/auth.controllers';
import authenticateUser from '../../middlewares/authenticate.user';
import { editCustomer } from '../../controllers/admin/admin.operation.controller';
import { kycTierTwoRequest } from '../../controllers/customer/utilities.controller';
// import authController from '../controllers/auth.controller';
const authRouter = express.Router();

authRouter.post('/customer/register', registerCustomerController);
authRouter.post('/logout', logoutController);
authRouter.post('/verify-email-otp', authenticateUser, verifyUserController);
authRouter.post('/verify-forgot-password-otp', verifyForgotPasswordOtp);
authRouter.post('/resend-otp', resendOtpController);
authRouter.post('/forgot-password', sendPasswordOtpController);
authRouter.post('/edit-profile',authenticateUser,editProfileController)
authRouter.post('/kyc-request',authenticateUser,kycTierTwoRequest);
export default authRouter;
