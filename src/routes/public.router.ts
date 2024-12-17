import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getAllDepartmentsController,
  getCategoriesFromDepartment,
  getCountriesController,
  getNotificationController,
  getSubCategoriesFromCatDepart,
  loginController,
  markAllReadController,
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

publicRouter.get('/countries', authenticateUser, getCountriesController);
publicRouter.get('/get-all-notifications',authenticateUser,getNotificationController)
publicRouter.get('/mark-all-read',authenticateUser,markAllReadController)

export default publicRouter;
