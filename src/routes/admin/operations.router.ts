import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
    getAllChatsController,
    getChatDetailsController,
    sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { createAgent, createCategory, createDepartment, createSubCategory, deleteDepartment, editAgent, editDepartment, getAgent, getAgentsByDepartment, getAlldepartments, getDepartment } from '../../controllers/admin/admin.utilities.controllers';
import upload from '../../middlewares/multer.middleware';
import { createRate, getAllCustomers, getCustomerDetails, getRates, getTransactionForCustomer } from '../../controllers/admin/admin.operation.controller';

const operationsRouter = express.Router();
operationsRouter.post('/create-agent',upload.single('profilepicture'), createAgent);
operationsRouter.post('/update-agent', editAgent);
operationsRouter.get('/get-agent/:agentId', getAgent);
//department routes
operationsRouter.post('/create-department', upload.single('icon'),createDepartment);
operationsRouter.get('/get-department/:id',getDepartment);
operationsRouter.get('/get-all-department/',getAlldepartments);
operationsRouter.post('/update-department', upload.single('icon'),editDepartment);
operationsRouter.delete('/delete-department/:id',deleteDepartment);
operationsRouter.post('/create-category',upload.single('image'),createCategory);
operationsRouter.post('/create-subcategory',createSubCategory);
operationsRouter.get('/get-customer-details/:id',authenticateUser,getCustomerDetails);

operationsRouter.get('/get-all-customers',authenticateUser,getAllCustomers);

operationsRouter.get('/get-customer-transactions/:id',authenticateUser,getTransactionForCustomer);

operationsRouter.get('/get-agent-by-department/:id',authenticateUser,getAgentsByDepartment);
operationsRouter.post('/create-rate',authenticateUser,createRate);
operationsRouter.get('/get-rate',authenticateUser,getRates);
export default operationsRouter;
