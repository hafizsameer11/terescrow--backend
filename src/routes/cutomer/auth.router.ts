import express from 'express';
import {
  changePasswordController,
  editProfileController,
  getAllNotifcications,
  logoutController,
  registerCustomerController,
  resendOtpController,
  sendPasswordOtpController,
  setNewPasswordController,
  verifyForgotPasswordOtp,
  verifyUserController,
} from '../../controllers/customer/auth.controllers';
import authenticateUser from '../../middlewares/authenticate.user';
import { editCustomer } from '../../controllers/admin/admin.operation.controller';
// import { kycTierTwoRequest } from '../../controllers/customer/utilities.controller';
// import { editCustomer } from '../../controllers/admin/admin.operation.controller';
import { kycTierTwoRequest } from '../../controllers/customer/utilities.controller';
import upload from '../../middlewares/multer.middleware';
// import authController from '../controllers/auth.controller';
const authRouter = express.Router();

authRouter.post('/customer/register', upload.single('profilePicture'),registerCustomerController);
authRouter.post('/logout', logoutController);
authRouter.post('/verify-email-otp', authenticateUser, verifyUserController);
authRouter.post('/verify-forgot-password-otp', verifyForgotPasswordOtp);
authRouter.post('/resend-otp', resendOtpController);
authRouter.post('/forgot-password', sendPasswordOtpController);
authRouter.post('/edit-profile',authenticateUser,editProfileController)
authRouter.post('/change-password',authenticateUser,changePasswordController)
authRouter.post('/kyc-request',authenticateUser,kycTierTwoRequest);
authRouter.get('/get-all-notifications',authenticateUser,getAllNotifcications);
authRouter.post('/set-new-password',setNewPasswordController);
export default authRouter;
