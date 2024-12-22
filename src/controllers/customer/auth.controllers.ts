import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { validationResult } from 'express-validator';
import { Gender, OtpType, PrismaClient, User, UserRoles } from '@prisma/client';
import {
  comparePassword,
  generateOTP,
  generateToken,
  hashPassword,
  sendVerificationEmail,
  verifyToken,
} from '../../utils/authUtils';

const prisma = new PrismaClient();

const registerCustomerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log(req.body);
    console.log(req.file);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest(
        'Please enter valid credentials',
        errors.array()
      );
    }
    const { termsAccepted = false } = req.body;
    if (termsAccepted) {
      if (termsAccepted === false) {
        return next(ApiError.badRequest('Please accept terms and conditions'))
      }
    }
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      username,
      gender,
      countryId,
      country,
    }: UserRequest = req.body;
    const profilePicture = req.file ? req.file.filename : '';

    // Check if any attribute already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }, { phoneNumber }],
      },
    });

    if (existingUser) {
      let conflictField = '';
      if (existingUser.email === email) {
        conflictField = 'email';
      } else if (existingUser.username === username) {
        conflictField = 'username';
      } else if (existingUser.phoneNumber === phoneNumber) {
        conflictField = 'phoneNumber';
      }

      throw ApiError.badRequest(
        `This ${conflictField} is already registered.`,
        { conflictField }
      );
    }

    console.log(req.body);
    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        username,
        gender: gender == 1 ? 'male' : 'female',
        // countryId: +countryId,
        country,
        profilePicture,
        role: UserRoles.customer,
      },
    });

    if (!newUser) {
      throw ApiError.internal('User creation failed');
    }

    const otp = generateOTP(4);

    const userOTP = await prisma.userOTP.create({
      data: {
        userId: newUser.id,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        type: OtpType.email_verification,
      },
    });

    if (!userOTP) {
      await prisma.user.delete({
        where: {
          username: newUser.username,
        },
      });
      throw ApiError.internal('User OTP creation failed');
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
    const user: User = req.body._user;
    const otp: string = req.body.otp;
    const userOTP = await prisma.userOTP.findUnique({
      where: {
        userId: user.id,
        type: OtpType.email_verification,
      },
    });

    // console.log(userOTP);

    if (!userOTP) {
      return next(ApiError.badRequest('User not found'));
    }

    if (userOTP.expiresAt < new Date()) {
      await prisma.userOTP.delete({
        where: {
          userId: user.id,
        },
      });
      return next(ApiError.badRequest('Your otp has been expired'));
    }

    if (userOTP.attempts >= 5) {
      await prisma.userOTP.delete({
        where: {
          userId: user.id,
        },
      });
      return next(ApiError.badRequest('Your otp has been expired'));
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
    // console.log(updateUser.isVerified);
    if (!updateUser) {
      return next(ApiError.internal('User verification Failed!'));
    }

    await prisma.userOTP.delete({
      where: {
        userId: user.id,
      },
    });
    // console.log('fulfilled');
    return new ApiResponse(201, null, 'User Verified Successfully.').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
};

const verifyForgotPasswordOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // console.log('reached');
    const { email, otp } = req.body as { email: string; otp: string };
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) {
      return next(ApiError.badRequest('User not found'));
    }

    const isUserOtp = await prisma.userOTP.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (!isUserOtp) {
      return next(ApiError.badRequest('Otp not generated for this user'));
    }

    if (isUserOtp.expiresAt < new Date()) {
      await prisma.userOTP.delete({
        where: {
          userId: user.id,
        },
      });
      return next(ApiError.badRequest('Your otp has been expired'));
    }

    if (isUserOtp.attempts >= 5) {
      await prisma.userOTP.delete({
        where: {
          userId: user.id,
        },
      });
      return next(ApiError.badRequest('Your otp has been expired'));
    }

    if (isUserOtp.otp !== otp) {
      await prisma.userOTP.update({
        where: {
          userId: user.id,
        },
        data: {
          attempts: { increment: 1 },
        },
      });
      return next(ApiError.badRequest('Invalid OTP'));
    }

    await prisma.userOTP.delete({
      where: {
        userId: user.id,
      },
    });
    // console.log('fulfilled');
    //return userId
    const resData = {
      userId: user.id
    }
    return new ApiResponse(200, resData, 'Otp verified successfully.').send(res);
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
    const { token, email } = req.body as { email: string; token: string };

    if (!token || !email) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    let user: User;
    const newOtp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
    let decodedToken: any;
    if (token) {
      const decoded = await verifyToken(token);
      const isUser = await prisma.user.findUnique({
        where: {
          id: decoded.id,
        },
      });

      if (!isUser) {
        return next(ApiError.badRequest('User not found'));
      }
      decodedToken = decoded;
      await prisma.userOTP.upsert({
        where: { userId: isUser.id },
        update: {
          otp: newOtp,
          expiresAt,
          attempts: 0, // Reset the attempt count on OTP resend
        },
        create: {
          userId: isUser.id,
          otp: newOtp,
          type: OtpType.email_verification,
          expiresAt,
          attempts: 0,
        },
      });
    }
    if (email) {
      const isUser = await prisma.user.findUnique({
        where: {
          email,
        },
      });
      if (!isUser) {
        return next(ApiError.badRequest('User not found'));
      }
      await prisma.userOTP.upsert({
        where: { userId: isUser.id },
        update: {
          otp: newOtp,
          expiresAt,
          attempts: 0, // Reset the attempt count on OTP resend
        },
        create: {
          userId: isUser.id,
          otp: newOtp,
          type: OtpType.password_verification,
          expiresAt,
          attempts: 0,
        },
      });
    }

    // Generate new OTP
    // const newOtp = generateOTP();

    // Update or create OTP in UserOTP table

    // Send the OTP to user's email
    await sendVerificationEmail(decodedToken.email, newOtp);

    return new ApiResponse(
      200,
      null,
      'OTP has been resent to your email.'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
};

const sendPasswordOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body as { email: string };

    if (!email) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    const isUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!isUser) {
      return next(ApiError.badRequest('User not found'));
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

    // Update or create OTP in UserOTP table
    const newOtp = await prisma.userOTP.upsert({
      where: { userId: isUser.id },
      update: {
        otp: otp,
        expiresAt,
        attempts: 0, // Reset the attempt count on OTP resend
        type: OtpType.password_verification,
      },
      create: {
        type: OtpType.password_verification,
        userId: isUser.id,
        otp: otp,
        expiresAt,
        attempts: 0,
      },
    });

    if (newOtp) {
      await sendVerificationEmail(isUser.email, otp);
    }

    return new ApiResponse(
      200,
      { email: isUser.email },
      'OTP has been resent to your email.'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
};
export const setNewPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log(req.body);
    //get the userId and new passowrd
    const { userId, password } = req.body;
    const hashedPassword = await hashPassword(password);
    //first check if user exists
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (!user) {
      return next(ApiError.badRequest('User not found'));
    }
    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });
    //send success message
    return new ApiResponse(
      200,
      updatedUser,
      'Password changed successfully'
    ).send(res);


  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error!'));
  }
}
export const editProfileController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      userName,
      gender,
      countryId,
    } = req.body;
    console.log(
      firstName,
      lastName,
      email,
      phoneNumber,
      userName,
      gender,
      countryId
    );

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    console.log(req.body)
    if (!existingUser) {
      return next(ApiError.notFound('User not found'));
    }

    // Check if email, phone number, or username already exists for other users
    const isDuplicate = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: user.id } }, // Ensure it's not the current user
          {
            OR: [
              { email: email },
              { username: userName },
              { phoneNumber: phoneNumber },
            ],
          },
        ],
      },
    });

    if (isDuplicate) {
      return next(
        ApiError.badRequest('Email, username, or phone already in use')
      );
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstname: firstName || existingUser.firstname,
        lastname: lastName || existingUser.lastname,
        email: email || existingUser.email,
        phoneNumber: phoneNumber || existingUser.phoneNumber,
        username: userName || existingUser.username,
        gender: gender || existingUser.gender,
        countryId: countryId || existingUser.countryId,
      },
    });

    return new ApiResponse(
      200,
      updatedUser,
      'Profile updated successfully'
    ).send(res);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};
// export const verifyPassword
export const changePasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const { oldPassword, newPassword } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!existingUser) {
      return next(ApiError.notFound('User not found'));
    }
    const isMatch = await comparePassword(oldPassword, user.password);
    if (!isMatch) {
      return next(ApiError.badRequest('Old password is incorrect'));
    }
    const hashedPassword = await hashPassword(newPassword);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });
    // Return the updated user with a success message
    return new ApiResponse(
      200,
      updatedUser,
      'Password changed successfully'
    ).send(res);
  } catch (error) {
    console.error(error);
    next(ApiError.internal('Internal Server Error'));
  }
};

export const getAllNotifcications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const notifications = await prisma.inAppNotification.findMany({
      where: { userId: user.id, isRead: false },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return new ApiResponse(
      200,
      notifications,
      'Notifications fetched successfully'
    ).send(res);
  } catch (error) {
    console.error(error);
    next(ApiError.internal('Internal Server Error'));
  }
}

export {
  registerCustomerController,
  logoutController,
  verifyUserController,
  resendOtpController,
  verifyForgotPasswordOtp,
  sendPasswordOtpController,
};

//interfaces

export interface UserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  username: string;
  gender: number; // Assuming an enum-like structure for gender
  countryId: string;
  role: UserRoles;
  country: string;
}
