import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
// import {
//   getAllChatsController,
//   getChatDetailsController,
//   sendMessageController,
// } from '../../controllers/customer/chat.controllers';
import {
  createCategory,
  createDepartment,
  createOrUpdatePrivacyPageLinks,
  createSubCategory,
  deleteCategory,
  deleteDepartment,
  editAgent,
  editCategory,
  editDepartment,
  editSubCategory,
  getAccountActivityofUser,
  getAgent,
  getAgentsByDepartment,
  getAllAgents,
  getallCategories,
  getAlldepartments,
  getallSubCategories,
  getAllTrsansactions,
  getDepartment,
  getPrivacyPageLinks,
  getSingleCategory,
  getTransactionForCustomer,
  kycUser,
} from '../../controllers/admin/admin.utilities.controllers';
import upload from '../../middlewares/multer.middleware';
import {
  changeUserStatus,
  createBanner,
  createNotification,
  createRate,
  createWayOfHearing,
  deleteBanner,
  deleteNotification,
  editCustomer,
  getAdminDashboardStats,
  getAgents,
  getAllCustomers,
  getAllUsers,
  getBanners,
  getCustomerDetails,
  getCustomerStats,
  getDepartmentStatsByTransaction,

  getNotificationForUsers,

  getNotifications,
  getRates,
  getTeamMembers,
  getWaysOfHearing,
  updateBanner,
  updateKycStatus,
  updateNotification,
  updateWayOfHearing,
} from '../../controllers/admin/admin.operation.controller';
import { getAgentCustomerChatDetails, getAgentTeamChatDetailsController, getAllCustomerWithAgentsChats, getSingleAgentWithCustomerChats, getSingleAgentWithTeam } from '../../controllers/admin/admin.chat.controllers';
import { customerStats, getChatStats, getDashBoardStats, teamStats, transactionStats } from '../../controllers/admin/admin.stats.controller';
import { addOrUpdateRolePermissions, createRoles, getRoles, getRolesList } from '../../controllers/admin/rolemanagement.controller';
import { createKycClimits, getKycLimits, updateKycLimits } from '../../controllers/admin/admin.kyccontroller';
import { getSmtpDetails, updateSmtp } from '../../controllers/admin/admin.settings';

const operationsRouter = express.Router();

/*

department routes

*/
operationsRouter.post(
  '/create-department',
  upload.single('icon'),
  createDepartment
);
operationsRouter.get('/get-department/:id', getDepartment);
operationsRouter.get('/get-all-department', getAlldepartments);
operationsRouter.post(
  '/update-department/:id',
  upload.single('icon'),
  editDepartment
);
operationsRouter.get('/delete-department/:id', deleteDepartment);
/*

Category routes

*/
operationsRouter.post(
  '/create-category',
  upload.single('image'),
  createCategory
);
operationsRouter.post('/update-category/:id', upload.single('image'), editCategory);
operationsRouter.get('/delete-category/:id', deleteCategory);
operationsRouter.get('/get-all-categories', getallCategories);
operationsRouter.get('/get-single-category/:id', getSingleCategory);

operationsRouter.post('/create-subcategory', createSubCategory);
operationsRouter.post('/update-subcategory/:id', editSubCategory);

/*

customer and agent routes


*/
operationsRouter.post(
  '/update-customer/:id',
  upload.single('profilePicture'),
  authenticateUser,
  editCustomer
);
// operationsRouter.post('/create-agent', upload.single('profilepicture'), createAgent);
operationsRouter.post('/update-agent/:agentId', editAgent);
operationsRouter.get('/get-agent/:agentId', getAgent);
operationsRouter.get(
  '/get-customer-details/:id',
  authenticateUser,
  getCustomerDetails
);
/**
 * @swagger
 * /api/admin/operations/get-all-customers:
 *   get:
 *     summary: Get all customers
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 */
operationsRouter.get('/get-all-customers', authenticateUser, getAllCustomers);

/**
 * @swagger
 * /api/admin/operations/get-agent-by-department/{id}:
 *   get:
 *     summary: Get agents by department
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Agents retrieved successfully
 */
operationsRouter.get(
  '/get-agent-by-department/:id',
  authenticateUser,
  getAgentsByDepartment
);

/**
 * @swagger
 * /api/admin/operations/get-all-agents:
 *   get:
 *     summary: Get all agents
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Agents retrieved successfully
 */
operationsRouter.get('/get-all-agents', authenticateUser, getAllAgents);

/**
 * @swagger
 * /api/admin/operations/get-all-users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
operationsRouter.get('/get-all-users', authenticateUser, getAllUsers);

/**
 * @swagger
 * /api/admin/operations/get-team-members:
 *   get:
 *     summary: Get team members
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Team members retrieved successfully
 */
operationsRouter.get('/get-team-members', authenticateUser, getAgents);

/**
 * @swagger
 * /api/admin/operations/get-team-members-2:
 *   get:
 *     summary: Get team members (alternative endpoint)
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Team members retrieved successfully
 */
operationsRouter.get('/get-team-members-2', authenticateUser, getTeamMembers);

/*  operational routes for rates , sub categories */
/**
 * @swagger
 * /api/admin/operations/create-rate:
 *   post:
 *     summary: Create exchange rate
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rate:
 *                 type: number
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Rate created successfully
 */
operationsRouter.post('/create-rate', authenticateUser, createRate);

/**
 * @swagger
 * /api/admin/operations/get-rate:
 *   get:
 *     summary: Get exchange rates
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Rates retrieved successfully
 */
operationsRouter.get('/get-rate', authenticateUser, getRates);

/**
 * @swagger
 * /api/admin/operations/get-all-subcategories:
 *   get:
 *     summary: Get all subcategories
 *     tags: [Admin Operations]
 *     responses:
 *       200:
 *         description: Subcategories retrieved successfully
 */
operationsRouter.get('/get-all-subcategories', getallSubCategories);

//app banner routes
operationsRouter.post(
  '/create-banner',
  upload.single('image'),
  authenticateUser,
  createBanner
);
operationsRouter.get('/get-all-banners', getBanners);
operationsRouter.post(
  '/update-banner',
  authenticateUser,
  upload.single('image'),
  updateBanner
);
operationsRouter.delete('/delete-banner/:id', authenticateUser, deleteBanner);

operationsRouter.post(
  '/create-notification',
  upload.single('image'),
  authenticateUser,
  createNotification
);
operationsRouter.post(
  '/update-notification',
  authenticateUser,
  updateNotification
);
operationsRouter.delete(
  '/delete-notification/:id',
  authenticateUser,
  deleteNotification
);
operationsRouter.get(
  '/get-all-notifications',
  upload.single('image'),
  authenticateUser,
  getNotifications
);

/*

Account Activity Routes

*/
operationsRouter.get(
  '/get-user-activity/:id',
  authenticateUser,
  getAccountActivityofUser
);

/**
 * @swagger
 * /api/admin/operations/get-all-transactions:
 *   get:
 *     summary: Get all transactions
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 */
operationsRouter.get('/get-all-transactions', authenticateUser, getAllTrsansactions);

/**
 * @swagger
 * /api/admin/operations/get-customer-transactions/{id}:
 *   get:
 *     summary: Get customer transactions
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Customer transactions retrieved successfully
 */
operationsRouter.get('/get-customer-transactions/:id', authenticateUser, getTransactionForCustomer);

/**
 * @swagger
 * /api/admin/operations/get-department-transaction:
 *   get:
 *     summary: Get department transaction statistics
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Department transaction stats retrieved successfully
 */
operationsRouter.get('/get-department-transaction', authenticateUser, getDepartmentStatsByTransaction);
operationsRouter.get('/get-all-agent-to-customer-chats', authenticateUser, getAllCustomerWithAgentsChats); //all chats
operationsRouter.get('/get-agent-customer-chats/:agentId', authenticateUser, getSingleAgentWithCustomerChats); //agent with customer chats
operationsRouter.get('/get-agent-team-chats/:agentId', authenticateUser, getSingleAgentWithTeam); //agent with team chats
operationsRouter.get('/get-agent-customer-chatdetails/:chatId', authenticateUser, getAgentCustomerChatDetails);
operationsRouter.get('/get-agent-agent-chatdetails/:chatId', authenticateUser, getAgentTeamChatDetailsController);
operationsRouter.get('/get-chat-stats', authenticateUser, getChatStats);
/**
 * @swagger
 * /api/admin/operations/get-dashboard-stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Admin Operations]
 *     responses:
 *       200:
 *         description: Dashboard stats retrieved successfully
 */
operationsRouter.get('/get-dashboard-stats', getDashBoardStats);

/**
 * @swagger
 * /api/admin/operations/get-customer-stats:
 *   get:
 *     summary: Get customer statistics
 *     tags: [Admin Operations]
 *     responses:
 *       200:
 *         description: Customer stats retrieved successfully
 */
operationsRouter.get('/get-customer-stats', customerStats);

/**
 * @swagger
 * /api/admin/operations/get-team-stats:
 *   get:
 *     summary: Get team statistics
 *     tags: [Admin Operations]
 *     responses:
 *       200:
 *         description: Team stats retrieved successfully
 */
operationsRouter.get('/get-team-stats', teamStats);

/**
 * @swagger
 * /api/admin/operations/get-transaction-stats:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Admin Operations]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transaction stats retrieved successfully
 */
operationsRouter.get('/get-transaction-stats', authenticateUser, transactionStats);

operationsRouter.post('/update-kycstatus/:userId', authenticateUser, updateKycStatus);
operationsRouter.get('/get-rates', authenticateUser, getRates);
operationsRouter.get('/get-notification-for-users/:userId', authenticateUser, getNotificationForUsers);
//role management part
operationsRouter.post('/create-role', createRoles);
operationsRouter.get('/get-roles', getRoles);
operationsRouter.get('/get-roles-list', getRolesList);
operationsRouter.post('/create-permissions', addOrUpdateRolePermissions);
operationsRouter.post('/change-status/:userId', changeUserStatus);

operationsRouter.post('/create-kyc-limit', createKycClimits);
operationsRouter.get('/get-kyc-limits', getKycLimits);
operationsRouter.post('/update-kyc-limit/:kycId', updateKycLimits);
//smtp route
operationsRouter.post('/create-smtp', updateSmtp)
operationsRouter.get('/get-smtp', getSmtpDetails)
operationsRouter.post('/create-privacy-page', createOrUpdatePrivacyPageLinks);
operationsRouter.get('/privacy-page-links', getPrivacyPageLinks);
operationsRouter.get('/kyc-users', kycUser);

operationsRouter.get('/get-all-ways-of-hearing', getWaysOfHearing);
operationsRouter.post('/create-ways-of-hearing', createWayOfHearing);
operationsRouter.post('/update-ways-of-hearing/:id', updateWayOfHearing);
export default operationsRouter;