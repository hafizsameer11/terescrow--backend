import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { PrismaClient, UerRoles, User } from '@prisma/client';

const prisma = new PrismaClient();

const getDepartmentsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UerRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const departments = await prisma.department.findMany();
    if (!departments) {
      return next(ApiError.notFound('Departments not found'));
    }

    return new ApiResponse(200, departments, 'Departments found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

const getCategoriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UerRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { departmentId } = req.params;

    const categories = await prisma.catDepart.findMany({
      where: {
        departmentId: parseInt(departmentId),
      },
      select: {
        category: true,
      },
    });

    if (!categories) {
      return next(ApiError.notFound('Categories not found'));
    }
    const resData = {
      departmentId,
      categories,
    };
    return new ApiResponse(200, resData, 'Categories found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

const getSubCategoriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UerRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { departmentId, categoryId } = req.query;

    const subCategories = await prisma.catSubcat.findMany({
      where: {
        categoryId: parseInt(categoryId as string),
      },
      select: {
        subCategory: true,
      },
    });

    if (!subCategories) {
      return next(ApiError.notFound('SubCategories not found'));
    }
    const resData = {
      departmentId,
      categoryId,
      subCategories,
    };
    return new ApiResponse(200, resData, 'SubCategories found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
  }
};

const getCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UerRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const countries = await prisma.country.findMany();
    if (!countries) {
      return next(ApiError.notFound('Countries not found'));
    }

    return new ApiResponse(200, countries, 'Countries found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

export {
  getDepartmentsController,
  getCategoriesController,
  getSubCategoriesController,
  getCountriesController,
};
