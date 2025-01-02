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
  getSingleCategory,
  getTransactionForCustomer,
} from '../../controllers/admin/admin.utilities.controllers';
import upload from '../../middlewares/multer.middleware';
import {
  changeUserStatus,
  createBanner,
  createNotification,
  createRate,
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
  updateBanner,
  updateKycStatus,
  updateNotification,
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
operationsRouter.get('/get-all-customers', authenticateUser, getAllCustomers);
operationsRouter.get(
  '/get-agent-by-department/:id',
  authenticateUser,
  getAgentsByDepartment
);
// operationsRouter.get('/get-all-agents', authenticateUser, getAllAgents);
operationsRouter.get('/get-all-agents', authenticateUser, getAllAgents);
operationsRouter.get('/get-all-users', authenticateUser, getAllUsers);
operationsRouter.get('/get-team-members', authenticateUser, getAgents);
operationsRouter.get('/get-team-members-2', authenticateUser, getTeamMembers);

/*  operational routes for rates , sub categories */
operationsRouter.post('/create-rate', authenticateUser, createRate);
operationsRouter.get('/get-rate', authenticateUser, getRates);
operationsRouter.get('/get-all-subcategories', getallSubCategories);

//app banner routes
operationsRouter.post(
  '/create-banner',
  upload.single('image'),
  authenticateUser,
  createBanner
);
operationsRouter.get('/get-all-banners', authenticateUser, getBanners);
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

operationsRouter.get('/get-all-transactions', authenticateUser, getAllTrsansactions);
operationsRouter.get('/get-customer-transactions/:id', authenticateUser, getTransactionForCustomer);
// operationsRouter.get('/get-customer-stats', authenticateUser, getCustomerStats);
operationsRouter.get('/get-department-transaction', authenticateUser, getDepartmentStatsByTransaction);
operationsRouter.get('/get-all-agent-to-customer-chats', authenticateUser, getAllCustomerWithAgentsChats); //all chats
operationsRouter.get('/get-agent-customer-chats/:agentId', authenticateUser, getSingleAgentWithCustomerChats); //agent with customer chats
operationsRouter.get('/get-agent-team-chats/:agentId', authenticateUser, getSingleAgentWithTeam); //agent with team chats
operationsRouter.get('/get-agent-customer-chatdetails/:chatId', authenticateUser, getAgentCustomerChatDetails);
operationsRouter.get('/get-agent-agent-chatdetails/:chatId', authenticateUser, getAgentTeamChatDetailsController);
operationsRouter.get('/get-chat-stats', authenticateUser, getChatStats);
operationsRouter.get('/get-dashboard-stats', getDashBoardStats);
operationsRouter.get('/get-customer-stats', customerStats);
operationsRouter.get('/get-team-stats', teamStats);
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

operationsRouter.post('create-kyc-limit', createKycClimits);
operationsRouter.get('get-kyc-limits', getKycLimits);
operationsRouter.post('update-kyc-limit/:kycId', updateKycLimits);
//smtp route
operationsRouter.post('/create-smtp', updateSmtp)
operationsRouter.post('/get-smtp', getSmtpDetails)
export default operationsRouter;