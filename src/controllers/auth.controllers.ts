import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { validationResult } from 'express-validator';
import { PrismaClient, User, UserRoles } from '@prisma/client';
import {
  comparePassword,
  generateOTP,
  generateToken,
  hashPassword,
  sendVerificationEmail,
} from '../utils/authUtils';

const prisma = new PrismaClient();

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
    const isUser = await prisma.user.findUnique({
      where: { email },
    });
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

    return new ApiResponse(
      200,
      isUser,
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

const registerCustomerController = async (
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
    }: UserRequest = req.body;

    const isUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }, { phoneNumber }],
      },
    });

    if (isUser) {
      throw ApiError.badRequest('This user is already registerd');
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        username,
        gender,
        country,
        role: UserRoles.CUSTOMER,
      },
    });

    if (!newUser) {
      throw ApiError.internal('User creation Failed');
    }

    const otp = generateOTP(4);

    const userOTP = await prisma.userOTP.create({
      data: {
        userId: newUser.id,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      },
    });

    if (!userOTP) {
      await prisma.user.delete({
        where: {
          username: newUser.username,
        },
      });
      throw ApiError.internal('User OTP creation Failed');
    }
    await sendVerificationEmail(email, otp);
    const token = generateToken(newUser.id, newUser.username, newUser.role);
    res.cookie('token', token, {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    return new ApiResponse(
      200,
      undefined,
      'User created successfully',
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

const verifyUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // console.log('reached');
    const user: User = req.body._user;
    const otp: string = req.body.otp;

    // console.log(user, otp);
    const userOTP = await prisma.userOTP.findUnique({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
    });

    // console.log(userOTP);

    if (!userOTP) {
      throw ApiError.badRequest('User not found');
    }
    if (userOTP.otp !== otp) {
      await prisma.userOTP.update({
        where: {
          userId: user.id,
        },
        data: {
          attempts: { increment: 1 },
        },
      });
      throw ApiError.badRequest('Invalid OTP');
    }
    const updateUser = await prisma.user.upsert({
      where: {
        id: user.id,
      },
      update: {
        isVerified: true,
      },
      create: {
        ...user,
      },
    });
    console.log(updateUser.isVerified);
    if (!updateUser) {
      throw ApiError.internal('User verification Failed!');
    }
    console.log('fulfilled');
    return new ApiResponse(201, null, 'User Verified Successfully.').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
};

const resendOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    // Generate new OTP
    const newOtp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

    // Update or create OTP in UserOTP table
    await prisma.userOTP.upsert({
      where: { userId: user.id },
      update: {
        otp: newOtp,
        expiresAt,
        attempts: 0, // Reset the attempt count on OTP resend
      },
      create: {
        userId: user.id,
        otp: newOtp,
        expiresAt,
        attempts: 0,
      },
    });

    // Send the OTP to user's email
    await sendVerificationEmail(user.email, newOtp);

    return new ApiResponse(200, null, 'OTP has been resent to your email.');
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
};

export {
  loginController,
  registerCustomerController,
  logoutController,
  verifyUserController,
  resendOtpController,
};

//interfaces

interface UserRequest {
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
