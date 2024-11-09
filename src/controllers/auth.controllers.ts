import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { comparePassword, generateToken } from '../utils/authUtils';

const Primsa = new PrismaClient();

// import { User, UserRole } from '../models/User';
// import { DriverStatus, Driver } from '../models/Driver';
// import { comparePassword, generateToken } from '../utils/authUtils';
// import { Types } from 'mongoose';

const loginController = async (
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
    const isUser = await Primsa.user.findUnique({ where: { email } });
    if (!isUser) {
      throw ApiError.badRequest('This email is not registerd');
    }
    const isMatch = await comparePassword(password, isUser.password);
    if (!isMatch) {
      throw ApiError.badRequest('Your password is not correct');
    }
    const token = generateToken(isUser.id, isUser.username, isUser.role);
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    return new ApiResponse(200, isUser, 'User logged in successfully').send(
      res
    );
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

const registerController = async (
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
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      username,
      gender,
      country,
      role,
    }: User = req.body;

    const isUser = await Primsa.user.findUnique({
      where: {
        email,
      },
    });
    if (isUser) {
      throw ApiError.badRequest('This email is already registerd');
    }

    const newUser = await Primsa.user.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email: email,
        phoneNumber: phoneNumber,
        password: password,
        username: username,
        gender: gender,
        country: country,
        role: role,
      },
    });

    if (!newUser) {
      throw ApiError.internal('User creation Failed');
    }

    return new ApiResponse(200, newUser, 'User created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.clearCookie('token');
    return new ApiResponse(200, null, 'User logged out successfully').send(res);
  } catch (error) {
    next(error);
  }
};

export { loginController, registerController, logoutController };

//interfaces

interface User {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  username: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER'; // Assuming an enum-like structure for gender
  country: string;
  role: 'ADMIN' | 'AGENT' | 'CUSTOMER';
}
