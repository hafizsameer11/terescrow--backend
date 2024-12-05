import express from 'express';
import authenticateUser from '../middlewares/authenticate.user';
import {
  getCategoriesController,
  getCountriesController,
  getDepartmentsController,
  getSubCategoriesController,
} from '../controllers/customer.controllers';

const customerRouter = express.Router();

customerRouter.get('/departments', authenticateUser, getDepartmentsController);

customerRouter.get(
  '/categories/:departmentId',
  authenticateUser,
  getCategoriesController
);

customerRouter.get(
  '/subcategories',
  authenticateUser,
  getSubCategoriesController
);

customerRouter.get('/countries', authenticateUser, getCountriesController);

export default customerRouter;
