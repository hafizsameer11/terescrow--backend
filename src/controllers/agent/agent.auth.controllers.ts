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
import { comparePassword, generateToken } from '../../utils/authUtils';
import ApiResponse from '../../utils/ApiResponse';

const prisma = new PrismaClient();

export const loginController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        console.log(req.body);
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw ApiError.badRequest(
                'Please enter valid credentials',
                errors.array()
            );
        }

        const { email, password }: { email: string; password: string } = req.body;
        console.log(email);
        if (!email || !password) {
            return next(ApiError.badRequest('Please enter valid credentials'));
        }
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
            profilePicture: `https://${req.get('host')}/uploads/${isUser.profilePicture}`,
            email: isUser.email,
            role: isUser.role,
            phoneNumber: isUser.phoneNumber,
            country: isUser.country,
            gender: isUser.gender,
            isVerified: isUser.isVerified,
            KycStateTwo: isUser.KycStateTwo,
            assignedDepartments: isUser.agent?.assignedDepartments,
            unReadNotification: getNotificationCount.length

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