import {
  UserRoles,
  PrismaClient,
  User,
  UserOTP,
  DepartmentStatus,
} from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { comparePassword, generateToken } from '../utils/authUtils';
import { validationResult } from 'express-validator';
import { profile } from 'console';

const prisma = new PrismaClient();

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest(
        'Please enter valid credentials',
        errors.array()
      );
    }
    const { email, password }: { email: string; password: string } = req.body;

    if (!email || !password) {
      return next(ApiError.badRequest('Please enter valid credentials'));
    }

    const isUser = await prisma.user.findUnique({
      where: { email },
    });
    if (!isUser) {
      return next(ApiError.badRequest('This email is not registerd'));
    }
    // console.log(password);
    const isMatch = await comparePassword(password, isUser.password);
    if (!isMatch) {
      return next(ApiError.badRequest('Your password is not correct'));
    }
    const token = generateToken(isUser.id, isUser.username, isUser.role);
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });

    const resData = {
      id: isUser.id,
      firstname: isUser.firstname,
      lastname: isUser.lastname,
      username: isUser.username,
      profilePicture: isUser.profilePicture,
      email: isUser.email,
      role: isUser.role,
    };

    return new ApiResponse(
      200,
      resData,
      'User logged in successfully',
      token
    ).send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

export const getAllDepartmentsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    if (!user) {
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

export const getCategoriesFromDepartment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (!user) {
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

export const getSubCategoriesFromCatDepart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (!user) {
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

export const getCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const countries = await prisma.country.findMany({
      select: {
        id: true,
        title: true,
      },
    });
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

export const readAllMessagesControllers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user, chatId }: { _user: User; chatId: number } = req.body;

    if (!_user || !chatId) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const messages = await prisma.message.updateMany({
      where: {
        chatId,
      },
      data: {
        isRead: true,
      },
    });

    if (!messages) {
      return next(ApiError.notFound('No messages were found'));
    }

    return new ApiResponse(201, undefined, 'Messages read successfully').send(
      res
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};
