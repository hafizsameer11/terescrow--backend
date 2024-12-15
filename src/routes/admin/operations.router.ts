import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
    getAllChatsController,
    getChatDetailsController,
    sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { createAgent, createCategory, createDepartment, createSubCategory, deleteCategory, deleteDepartment, editAgent, editCategory, editDepartment, getAgent, getAgentsByDepartment, getallCategories, getAlldepartments, getallSubCategories, getDepartment, getSingleCategory } from '../../controllers/admin/admin.utilities.controllers';
import upload from '../../middlewares/multer.middleware';
import { createBanner, createRate, deleteBanner, editCustomer, getAgents, getAllCustomers, getAllUsers, getBanners, getCustomerDetails, getRates, getTransactionForCustomer, updateBanner } from '../../controllers/admin/admin.operation.controller';

const operationsRouter = express.Router();

/*

department routes

*/
operationsRouter.post('/create-department', upload.single('icon'), createDepartment);
operationsRouter.get('/get-department/:id', getDepartment);
operationsRouter.get('/get-all-department/', getAlldepartments);
operationsRouter.post('/update-department', upload.single('icon'), editDepartment);
operationsRouter.delete('/delete-department/:id', deleteDepartment);
/*

Category routes

*/
operationsRouter.post('/create-category', upload.single('image'), createCategory);
operationsRouter.post('/update-category', upload.single('image'), editCategory);
operationsRouter.get('/delete-category', deleteCategory);
operationsRouter.get('/get-all-categories', getallCategories);
operationsRouter.get('/get-single-category/:id', getSingleCategory);

operationsRouter.post('/create-subcategory', createSubCategory);

/*

customer and agent routes


*/
operationsRouter.post('/update-customer/:id',upload.single('profilePicture'), authenticateUser, editCustomer);
operationsRouter.post('/create-agent', upload.single('profilepicture'), createAgent);
operationsRouter.post('/update-agent/:id', editAgent);
operationsRouter.get('/get-agent/:agentId', getAgent);
operationsRouter.get('/get-customer-details/:id', authenticateUser, getCustomerDetails);
operationsRouter.get('/get-all-customers', authenticateUser, getAllCustomers);
operationsRouter.get('/get-customer-transactions/:id', authenticateUser, getTransactionForCustomer);
operationsRouter.get('/get-agent-by-department/:id', authenticateUser, getAgentsByDepartment);
operationsRouter.get('/get-all-users', authenticateUser, getAllUsers);
operationsRouter.get('/get-team-members', authenticateUser, getAgents);

/*  operational routes for rates , sub categories */
operationsRouter.post('/create-rate', authenticateUser, createRate);
operationsRouter.get('/get-rate', authenticateUser, getRates);
operationsRouter.get('/get-all-subcategories', getallSubCategories);


//app banner routes
operationsRouter.post('/create-banner', upload.single('image'), authenticateUser, createBanner);
operationsRouter.get('/get-all-banners', authenticateUser, getBanners);
operationsRouter.post('/update-banner', authenticateUser, upload.single('image'), updateBanner);
operationsRouter.delete('/delete-banner/:id', authenticateUser, deleteBanner);
export default operationsRouter;
