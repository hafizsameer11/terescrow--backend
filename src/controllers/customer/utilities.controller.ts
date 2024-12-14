import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { validationResult } from 'express-validator';
import { Gender, OtpType, PrismaClient, User, UserRoles } from '@prisma/client';

const prisma = new PrismaClient();


export const kycTierTwoRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user: User = req.body._user;
        if (!user) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const userId = user.id
        const { firstName, surName, firtName, bvn } = req.body
        const kycTierTwoRequest = await prisma.kycStateTwo.create({
            data: {
                firtName: firstName,
                bvn: bvn,
                surName: surName,
                userId: userId,
                status: 'tier2'
            }
        });
        if (!kycTierTwoRequest) {
            return next(ApiError.notFound('KycTierTwoRequest not found'));

        }

        return new ApiResponse(200, kycTierTwoRequest, 'KycTierTwoRequest found').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            next(error);
            return;
        }
        next(ApiError.internal('Internal Server Error'));
    }


}