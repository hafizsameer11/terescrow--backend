import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { validationResult } from 'express-validator';
import { Gender, OtpType, User, UserRoles } from '@prisma/client';
import {
  comparePassword,
  generateOTP,
  generateToken,
  hashPassword,
  sendVerificationEmail,
  sendWelcomeEmail,
  verifyToken,
} from '../../utils/authUtils';
import { prisma } from '../../utils/prisma';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { creditSignupBonus } from '../../services/referral/referral.commission.service';

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
    console.log(req.body);
    const { termsAccepted = 'false' } = req.body;
    const isTermsAccepted = termsAccepted === 'true';

    if (!isTermsAccepted) {
      return next(ApiError.badRequest('Please accept terms and conditions'));
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
      means,
      referralCodeInput,
      referralCode: referralCodeFromBody,
      referral_code: referralCodeSnakeCase,
    } = req.body;
    console.log(req.body)
    const profilePicture = req.file ? req.file.filename : '';

    // Check if any attribute already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }],
      },
    });

    if (existingUser) {
      let conflictField = '';
      if (existingUser.email === email) {
        conflictField = 'email';
      } 
      throw ApiError.badRequest(
        `This ${conflictField} is already registered.`,
        { conflictField }
      );
    }

    console.log(req.body);
    const hashedPassword = await hashPassword(password);
    const selectCountry = await prisma.country.findUnique({
      where: {
        id: parseInt(country) || 1,
      },
    })
    const selectMeans = await prisma.waysOfHearing.findUnique({
      where: {
        id: parseInt(means) || 1,
      },
    })

    // Referral code = username (case-insensitive lookup supported)
    const referralCode = username;

    let referrerId: number | null = null;
    const providedReferralCode =
      referralCodeInput || referralCodeFromBody || referralCodeSnakeCase;

    if (providedReferralCode) {
      const codeToLookup = providedReferralCode.toString().trim();

      // Match by username first (as requested), fallback to referralCode.
      let referrer = await prisma.user.findFirst({
        where: { username: codeToLookup },
        select: { id: true },
      });

      if (!referrer) {
        referrer = await prisma.user.findFirst({
          where: { referralCode: codeToLookup },
          select: { id: true },
        });
      }

      if (referrer) {
        referrerId = referrer.id;
      }
    }

    const newUser = await prisma.user.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        username,
        gender: gender == 1 ? 'male' : gender == 2 ? 'female' : 'other',
        // countryId: +countryId,
        country: selectCountry?.title || 'Nigeria',
        profilePicture,
        meansId: selectMeans?.id || 1,
        role: UserRoles.customer,
        referralCode,
        ...(referrerId ? { referredBy: referrerId } : {}),
      },
    });

    if (!newUser) {
      throw ApiError.internal('User creation failed');
    }

    if (referrerId) {
      creditSignupBonus(newUser.id, referrerId)
        .catch((err) => console.error('[Register] Referral signup bonus error:', err));
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
    await sendWelcomeEmail(email, firstName);
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

export const deleteCustomerController = async (req: Request,
  res: Response,
  next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const customer = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
    });
    //chnage the user email and add some rnadom nuber like current time stamp 
    const newEmail = `${customer?.email}_${Date.now()}`;
    const newUsername = `${customer?.username}_${Date.now()}`;
    //update the user email and username
    await prisma.user.update({
      where: {
        id: user.id,
      }, data: {
        email: newEmail,
        username: newUsername,
      }
    });
    //return response
    return new ApiResponse(200, null, 'User deleted successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
}
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

    // Auto-verify Tier 1 and create default wallet when user verifies email (only if not already verified)
    if (!user.isVerified && updateUser.isVerified) {
      try {
        // Auto-set Tier 1 verification
        await prisma.user.update({
          where: { id: updateUser.id },
          data: {
            kycTier1Verified: true,
            currentKycTier: 'tier1',
          },
        });
        console.log(`Tier 1 auto-verified for user ${updateUser.id}`);
        
        // Get user's country to determine default currency
        // Default to NGN if country is Nigeria, otherwise use NGN as default
        const defaultCurrency = user.country?.toLowerCase().includes('nigeria') ? 'NGN' : 'NGN';
        
        // Create default wallet (getOrCreateWallet is idempotent)
        await fiatWalletService.getOrCreateWallet(updateUser.id, defaultCurrency);
        console.log(`Default ${defaultCurrency} wallet created for user ${updateUser.id}`);

        // Create Tatum virtual accounts (async, don't block verification)
        // Dispatch job to queue system
        const { queueManager } = await import('../../queue/queue.manager');
        await queueManager.addJob(
          'tatum',
          'create-virtual-account',
          { userId: updateUser.id },
          {
            attempts: 3, // Retry 3 times on failure
            backoff: {
              type: 'exponential',
              delay: 5000, // Start with 5 second delay
            },
          }
        );
        console.log(`Virtual account creation job dispatched to queue for user ${updateUser.id}`);
      } catch (walletError) {
        // Log error but don't fail verification if wallet creation fails
        console.error('Error creating default wallet during email verification:', walletError);
      }
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

    // If user does not exist, return a clear error message and DO NOT send any email
    if (!isUser) {
      return next(ApiError.badRequest('Email does not exist'));
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
    const profilePicture = req.file?.filename;
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
    // Only check fields that are being updated and are different from current values
    const duplicateConditions: any[] = [];
    
    if (email && email !== existingUser.email) {
      duplicateConditions.push({ email: email });
    }
    
    if (userName && userName !== existingUser.username) {
      duplicateConditions.push({ username: userName });
    }
    
    if (phoneNumber && phoneNumber !== existingUser.phoneNumber) {
      duplicateConditions.push({ phoneNumber: phoneNumber });
    }

    // Only check for duplicates if there are fields to check
    if (duplicateConditions.length > 0) {
      const isDuplicate = await prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: user.id } }, // Ensure it's not the current user
            {
              OR: duplicateConditions,
            },
          ],
        },
      });

      if (isDuplicate) {
        return next(
          ApiError.badRequest('Email, username, or phone already in use')
        );
      }
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
        profilePicture: profilePicture || existingUser.profilePicture,
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

export const getKycDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const kycDetails = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id
      }
    })
    if (!kycDetails) {
      return new ApiResponse(200, kycDetails, 'No KYC details found').send(res);
    }

    return new ApiResponse(
      200,
      kycDetails,
      'KYC details fetched successfully'
    ).send(res);
  }

  catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
    // console.error(error);
    // next(ApiError.internal('Internal Server Error'));
  }
}

export const setPinController = async (
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

    const { email, pin } = req.body as { email: string; pin: string };

    // Find user by email
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return next(ApiError.notFound('User not found'));
    }

    // Update user with PIN
    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        pin: pin,
      },
      select: {
        id: true,
        email: true,
        pin: true,
      },
    });

    return new ApiResponse(
      200,
      { email: updatedUser.email, pinSet: true },
      'PIN set successfully'
    ).send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
};

export const updatePinController = async (
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

    const { email, pin } = req.body as { email: string; pin: string };

    // Find user by email
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return next(ApiError.notFound('User not found'));
    }

    // Update user with new PIN
    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        pin: pin,
      },
      select: {
        id: true,
        email: true,
        pin: true,
      },
    });

    return new ApiResponse(
      200,
      { email: updatedUser.email, pinUpdated: true },
      'PIN updated successfully'
    ).send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
};

export const verifyPinController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).body?._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { pin } = req.body as { pin: string };

    // Validate PIN format
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return next(ApiError.badRequest('Invalid PIN. Must be exactly 4 digits'));
    }

    // Get user with PIN
    const user = await prisma.user.findUnique({
      where: {
        id: authenticatedUser.id,
      },
      select: {
        id: true,
        email: true,
        pin: true,
      },
    });

    if (!user) {
      return next(ApiError.notFound('User not found'));
    }

    // Check if user has a PIN set
    if (!user.pin) {
      return next(ApiError.badRequest('PIN not set. Please set a PIN first.'));
    }

    // Verify PIN
    if (user.pin !== pin) {
      return next(ApiError.unauthorized('Invalid PIN'));
    }

    return new ApiResponse(
      200,
      { verified: true, email: user.email },
      'PIN verified successfully'
    ).send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
};

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
  means?: string;
}
