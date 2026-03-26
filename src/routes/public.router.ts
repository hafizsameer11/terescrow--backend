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
  updateWalletCurrencyPricesController,
} from '../controllers/public.controllers';
import { getChangeNowDiagnosticsController } from '../controllers/public/changenow.diagnostics.controller';
import { handlePublicMasterEthUsdtSwap } from '../controllers/public/changenow.public.swap.controller';
import { generateOTP, sendVerificationEmail } from '../utils/authUtils';

const publicRouter = express.Router();

/**
 * @swagger
 * /api/public/login:
 *   post:
 *     summary: User login (customer, agent, admin)
 *     tags: [Public]
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
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
publicRouter.post('/login', loginController);

/**
 * @swagger
 * /api/public/departments:
 *   get:
 *     summary: Get all departments
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Departments retrieved successfully
 */
publicRouter.get('/departments', authenticateUser, getAllDepartmentsController);

/**
 * @swagger
 * /api/public/categories/{departmentId}:
 *   get:
 *     summary: Get categories by department
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
publicRouter.get(
  '/categories/:departmentId',
  authenticateUser,
  getCategoriesFromDepartment
);

/**
 * @swagger
 * /api/public/subcategories:
 *   get:
 *     summary: Get subcategories
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Subcategories retrieved successfully
 */
publicRouter.get(
  '/subcategories',
  authenticateUser,
  getSubCategoriesFromCatDepart
);

/**
 * @swagger
 * /api/public/countries:
 *   get:
 *     summary: Get all countries
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Countries retrieved successfully
 */
publicRouter.get('/countries', authenticateUser, getCountriesController);

/**
 * @swagger
 * /api/public/get-all-notifications:
 *   get:
 *     summary: Get all notifications
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
publicRouter.get('/get-all-notifications', authenticateUser, getNotificationController);

/**
 * @swagger
 * /api/public/mark-all-read:
 *   get:
 *     summary: Mark all notifications as read
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
publicRouter.get('/mark-all-read', authenticateUser, markAllReadController);

/**
 * @swagger
 * /api/public/read-all-messages:
 *   post:
 *     summary: Mark all messages as read
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All messages marked as read
 */
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

/**
 * @swagger
 * /api/public/update-wallet-currency-prices:
 *   get:
 *     summary: Manually update wallet currency USD prices from CoinMarketCap
 *     tags: [Public]
 *     description: Public utility endpoint to refresh BTC/ETH/BNB/TRX/LTC prices in wallet_currencies.
 *     responses:
 *       200:
 *         description: Prices updated successfully
 */
publicRouter.get('/update-wallet-currency-prices', updateWalletCurrencyPricesController);

/**
 * ChangeNOW API probe report (sequential). No JWT — optional `CHANGENOW_DIAGNOSTICS_SECRET` gates access.
 * GET /api/public/changenow-diagnostics
 */
publicRouter.get('/changenow-diagnostics', getChangeNowDiagnosticsController);

/**
 * TEMP: Master wallet ETH → USDT (ERC20) via ChangeNOW; payout = same master ETH address.
 * GET (browser): /api/public/changenow-master-eth-usdt-swap?usdNotional=7&secret=...
 * POST JSON: { "usdNotional": 6.5, "secret": "..." }
 * Off only if CHANGENOW_PUBLIC_SWAP_ENABLED=false. Secret optional unless CHANGENOW_PUBLIC_SWAP_SECRET is set.
 */
publicRouter.get('/changenow-master-eth-usdt-swap', handlePublicMasterEthUsdtSwap);
publicRouter.post('/changenow-master-eth-usdt-swap', handlePublicMasterEthUsdtSwap);

export default publicRouter;
