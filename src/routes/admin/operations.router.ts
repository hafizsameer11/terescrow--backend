import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
    getAllChatsController,
    getChatDetailsController,
    sendMessageController,
} from '../../controllers/customer/chat.controllers';
import { createAgent, createDepartment, deleteDepartment, editAgent, editDepartment, getAgent, getAlldepartments, getDepartment } from '../../controllers/admin/admin.utilities.controllers';
import upload from '../../middlewares/multer.middleware';

const operationsRouter = express.Router();
operationsRouter.post('/create-agent', createAgent);
operationsRouter.post('/update-agent', editAgent);
operationsRouter.get('/get-agent/:agentId', getAgent);
//department routes
operationsRouter.post('/create-department', upload.single('icon'),createDepartment);
operationsRouter.get('/get-department/:id',getDepartment);
operationsRouter.get('/get-all-department/',getAlldepartments);
operationsRouter.post('/update-department', upload.single('icon'),editDepartment);
operationsRouter.delete('/delete-department/:id',deleteDepartment);



export default operationsRouter;
