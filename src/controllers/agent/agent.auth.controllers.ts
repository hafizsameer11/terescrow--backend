import {
    UserRoles,
    PrismaClient,
    User,
    UserOTP,
    DepartmentStatus,
} from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
//   import ApiError from '../utils/ApiError';
//   import ApiResponse from '../utils/ApiResponse';
//   import { comparePassword, generateToken } from '../utils/authUtils';
import { validationResult } from 'express-validator';
import { profile } from 'console';
import ApiError from '../../utils/ApiError';
import { comparePassword, issueSessionToken } from '../../utils/authUtils';
import ApiResponse from '../../utils/ApiResponse';
import { isAppleReviewUser } from '../../utils/apple.review.user';
import { v1Compat } from '../../config/v1.compat.config';
import {
  assertLoginRateLimit,
  clearLoginRateLimit,
} from '../../utils/auth.rate.limit';
import {
  assertNotLoginLocked,
  clearLoginLockout,
  recordFailedLogin,
  LOGIN_LOCK_MAX,
} from '../../utils/login.lockout';

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

        await assertLoginRateLimit({ identifier: email, req });

        const isUser = await prisma.user.findUnique({
            where: { email },
            include: {
                KycStateTwo: true,
                agent: {
                    include: {
                        assignedDepartments: {
                            select: {
                                department: {
                                    select: {
                                        id: true,
                                        title: true,
                                    }
                                }
                            }
                        }

                    }
                }
                ,
                customRole: {
                    include: {
                        permissions: true
                    }
                },
                AccountActivity: {
                    take: 6, // Fetch the latest 6 activities
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            },
        });
        //check if not agent than show error
        if (isUser && isUser.role === UserRoles.customer) {
            return next(ApiError.badRequest('You are not an agent'));
            // return next(ApiError.badRequest('You are an agent, please login as a user'));
        }
        if (!isUser) {
            return next(ApiError.badRequest('This email is not registerd'));
        }

        assertNotLoginLocked(isUser);
        
        if (v1Compat.blockUnverifiedLogin && isUser.isVerified === false) {
            return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
        }
        
        const isMatch = await comparePassword(password, isUser.password);
        if (!isMatch) {
            const fail = await recordFailedLogin(isUser.id);
            if (fail.locked) {
                return next(
                    ApiError.tooManyRequests(
                        `Account temporarily locked after ${LOGIN_LOCK_MAX} failed login attempts. Try again later or reset your password.`
                    )
                );
            }
            return next(ApiError.badRequest('Your password is not correct'));
        }

        await clearLoginRateLimit(email);
        await clearLoginLockout(isUser.id);
        const token = await issueSessionToken(isUser);
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });
        const getNotificationCount = await prisma.inAppNotification.findMany({
            where: {
                userId: isUser.id,
                isRead: false,
            }
        });
        const resData = {
            id: isUser.id,
            firstname: isUser.firstname,
            lastname: isUser.lastname,

            username: isUser.username,
            // profilePicture: isUser.profilePicture,
            profilePicture:isUser.profilePicture,
            email: isUser.email,
            role: isUser.role,
            ...(v1Compat.enableReadOnlyReviewAgent
                ? { readOnlyMode: isAppleReviewUser(isUser) }
                : {}),
            phoneNumber: isUser.phoneNumber,
            country: isUser.country,
            gender: isUser.gender,
            isVerified: isUser.isVerified,
            KycStateTwo: isUser.KycStateTwo,
            assignedDepartments: isUser.agent?.assignedDepartments,
            unReadNotification: getNotificationCount.length,
            customRole: isUser.customRole,
            accountActivity: isUser.AccountActivity

        };
        const accountActivity = await prisma.accountActivity.create({
            data: {
                userId: isUser.id,
                description: `User logged in successfully`,
            },
        })
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
// export const getRoleList