import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllDepartmentsController,
  getCategoriesFromDepartment,
  getCountriesController,
  getSubCategoriesFromCatDepart,
  loginController,
  readAllMessagesControllers,
} from '../controllers/public.controllers';

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

publicRouter.get('/countries', getCountriesController);

publicRouter.post(
  '/read-all-messages',
  authenticateUser,
  readAllMessagesControllers
);

export default publicRouter;
