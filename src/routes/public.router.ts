import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllDepartmentsController,
  getCategoriesFromDepartment,
  getCountriesController,
  getNotificationController,
  getSubCategoriesFromCatDepart,
  getUnreadMessagesCountController,
  loginController,
  markAllMessageReadController,
  markAllReadController,
  readAllMessagesControllers,
} from '../controllers/public.controllers';
import { generateOTP, sendVerificationEmail } from '../utils/authUtils';

const publicRouter = express.Router();

publicRouter.post('/login', loginController);

publicRouter.get('/departments', authenticateUser, getAllDepartmentsController);

publicRouter.get(
  '/categories/:departmentId',
  authenticateUser,
  getCategoriesFromDepartment
);

publicRouter.get(
  '/subcategories',
  authenticateUser,
  getSubCategoriesFromCatDepart
);

publicRouter.get('/countries', authenticateUser, getCountriesController);
publicRouter.get('/get-all-notifications', authenticateUser, getNotificationController)
publicRouter.get('/mark-all-read', authenticateUser, markAllReadController)
publicRouter.post(
  '/read-all-messages',
  authenticateUser,
  readAllMessagesControllers
);
publicRouter.get('/test-otp', async function (req, res) {
  try {
    const otp = generateOTP(4);
    const email = "hmstech11@gmail.com";
    await sendVerificationEmail(email, otp);

    res.status(200).json({
      message: 'OTP sent successfully!',
      otp: otp, // optionally you can return it here for testing (remove in production)
    });
  } catch (error) {
    console.log('Error sending OTP:', error);
    res.status(500).json({
      message: 'Failed to send OTP',
      error: error,
    });
  }
});

publicRouter.get('/get-unread-count', authenticateUser, getUnreadMessagesCountController);
publicRouter.get('/mark-all-messages-read', authenticateUser, markAllMessageReadController)
export default publicRouter;
