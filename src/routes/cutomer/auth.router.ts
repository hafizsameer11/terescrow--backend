import express from 'express';
import {
  changePasswordController,
  deleteCustomerController,
  editProfileController,
  getAllNotifcications,
  getKycDetails,
  logoutController,
  registerCustomerController,
  resendOtpController,
  sendPasswordOtpController,
  setNewPasswordController,
  setPinController,
  updatePinController,
  verifyForgotPasswordOtp,
  verifyPinController,
  verifyUserController,
} from '../../controllers/customer/auth.controllers';
import authenticateUser from '../../middlewares/authenticate.user';
import { editCustomer } from '../../controllers/admin/admin.operation.controller';
// import { kycTierTwoRequest } from '../../controllers/customer/utilities.controller';
// import { editCustomer } from '../../controllers/admin/admin.operation.controller';
import { kycTierTwoRequest } from '../../controllers/customer/utilities.controller';
import upload from '../../middlewares/multer.middleware';
import { pinValidation } from '../../utils/validations';
// import authController from '../controllers/auth.controller';
const authRouter = express.Router();

/**
 * @swagger
 * /api/auth/customer/register:
 *   post:
 *     summary: Register a new customer
 *     tags: [Customer Auth]
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
 *               - gender
 *               - country
 *               - termsAccepted
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
 *                 minLength: 8
 *               username:
 *                 type: string
 *               gender:
 *                 type: integer
 *                 description: 1=male, 2=female, 3=other
 *               country:
 *                 type: string
 *               countryId:
 *                 type: integer
 *               means:
 *                 type: integer
 *               termsAccepted:
 *                 type: string
 *                 enum: ["true"]
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 */
authRouter.post('/customer/register', upload.single('profilePicture'), registerCustomerController);
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Customer Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
authRouter.post('/logout', logoutController);

/**
 * @swagger
 * /api/auth/verify-email-otp:
 *   post:
 *     summary: Verify email with OTP
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       201:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
authRouter.post('/verify-email-otp', authenticateUser, verifyUserController);

/**
 * @swagger
 * /api/auth/verify-forgot-password-otp:
 *   post:
 *     summary: Verify OTP for password reset
 *     tags: [Customer Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified, returns userId
 *       400:
 *         description: Invalid OTP
 */
authRouter.post('/verify-forgot-password-otp', verifyForgotPasswordOtp);

/**
 * @swagger
 * /api/auth/resend-otp:
 *   post:
 *     summary: Resend verification OTP
 *     tags: [Customer Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP resent successfully
 */
authRouter.post('/resend-otp', resendOtpController);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset OTP
 *     tags: [Customer Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent to email
 */
authRouter.post('/forgot-password', sendPasswordOtpController);

/**
 * @swagger
 * /api/auth/edit-profile:
 *   post:
 *     summary: Update user profile
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
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
 *               userName:
 *                 type: string
 *               gender:
 *                 type: string
 *               countryId:
 *                 type: integer
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
authRouter.post('/edit-profile', upload.single('profilePicture'), authenticateUser, editProfileController);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Old password is incorrect
 */
authRouter.post('/change-password', authenticateUser, changePasswordController);

/**
 * @swagger
 * /api/auth/kyc-request:
 *   post:
 *     summary: Submit KYC information
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: KYC submitted successfully
 */
authRouter.post('/kyc-request', authenticateUser, kycTierTwoRequest);

/**
 * @swagger
 * /api/auth/get-all-notifications:
 *   get:
 *     summary: Get all user notifications
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
authRouter.get('/get-all-notifications', authenticateUser, getAllNotifcications);

/**
 * @swagger
 * /api/auth/set-new-password:
 *   post:
 *     summary: Set new password after OTP verification
 *     tags: [Customer Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - password
 *             properties:
 *               userId:
 *                 type: integer
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password set successfully
 */
authRouter.post('/set-new-password', setNewPasswordController);

/**
 * @swagger
 * /api/auth/get-kyc-details:
 *   get:
 *     summary: Get user KYC status and details
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: KYC details retrieved successfully
 */
authRouter.get('/get-kyc-details',authenticateUser,getKycDetails);

/**
 * @swagger
 * /api/auth/delete-customer:
 *   get:
 *     summary: Soft delete customer account
 *     tags: [Customer Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 */
authRouter.get('/delete-customer', authenticateUser, deleteCustomerController);

/**
 * @swagger
 * /api/auth/set-pin:
 *   post:
 *     summary: Set 4-digit PIN for user
 *     tags: [V2 - PIN Management]
 *     description: |
 *       **V2 API** - Set a new 4-digit PIN for user account.
 *       PIN is stored securely and linked to user email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - pin
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               pin:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "1234"
 *                 description: Must be exactly 4 digits
 *     responses:
 *       200:
 *         description: PIN set successfully
 *       400:
 *         description: Validation error
 */
authRouter.post('/set-pin', pinValidation, setPinController);

/**
 * @swagger
 * /api/auth/update-pin:
 *   post:
 *     summary: Update existing PIN
 *     tags: [V2 - PIN Management]
 *     description: |
 *       **V2 API** - Update an existing 4-digit PIN for user account.
 *       Requires user to have an existing PIN set.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - pin
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               pin:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "5678"
 *                 description: Must be exactly 4 digits
 *     responses:
 *       200:
 *         description: PIN updated successfully
 *       400:
 *         description: Validation error
 */
authRouter.post('/update-pin', pinValidation, updatePinController);

/**
 * @swagger
 * /api/auth/verify-pin:
 *   post:
 *     summary: Verify user PIN
 *     tags: [V2 - PIN Management]
 *     description: |
 *       **V2 API** - Verify user's 4-digit PIN.
 *       Requires user authentication. Used for transaction confirmations and sensitive operations.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *             properties:
 *               pin:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "1234"
 *                 description: Must be exactly 4 digits
 *     responses:
 *       200:
 *         description: PIN verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "PIN verified successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     verified:
 *                       type: boolean
 *                       example: true
 *                     email:
 *                       type: string
 *                       format: email
 *       400:
 *         description: Invalid PIN format or PIN not set
 *       401:
 *         description: Invalid PIN or unauthorized
 *       404:
 *         description: User not found
 */
authRouter.post('/verify-pin', authenticateUser, verifyPinController);

export default authRouter;
