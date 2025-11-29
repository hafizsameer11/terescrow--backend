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
    const { firstName, surName, bvn, dob } = req.body
    
    // This is the legacy endpoint - defaulting to tier2 for backward compatibility
    // New code should use /api/v2/kyc/tier2/submit
    const kycTierTwoRequest = await prisma.kycStateTwo.create({
      data: {
        firtName: firstName,
        bvn: bvn || '',
        surName: surName,
        dob: dob || '',
        userId: userId,
        tier: 'tier2', // Required field - defaulting to tier2
        status: 'tier2' // Legacy field
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
export const getTransactionGroupData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized("You are not authorized"));
    }

    const userId = user.id;

    // Group transactions by departmentId
    const transactionGroupData = await prisma.transaction.groupBy({
      by: ["departmentId"],
      where: {
        chat: {
          participants: {
            some: {
              userId: userId,
            },
          },
        },
      },
      _sum: {
        amount: true,
        amountNaira: true,
      },
      _max: {
        createdAt: true,
      },
    });

    const result = await Promise.all(
      transactionGroupData.map(async (transaction) => {
        const department = await prisma.department.findUnique({
          where: { id: transaction.departmentId || 0 },
          select: {
            title: true,
            icon: true,
            id: true,
          },
        });

        return {
          id: transaction.departmentId,
          amount: transaction._sum.amount || 0,
          amountNaira: transaction._sum.amountNaira || 0,
          createdAt: transaction._max.createdAt, // Latest createdAt
          department,
        };
      })
    );

    if (!result.length) {
      return next(ApiError.notFound("TransactionGroupData not found"));
    }

    return new ApiResponse(
      200,
      result,
      "TransactionGroupData found"
    ).send(res);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal("Internal Server Error"));
  }
};




export const getTransactionBydepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const departmetnId = req.params.id
    const user: User = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const userId = user.id
    const transactionGroupData = await prisma.transaction.findMany({
      where: {
        departmentId: parseInt(departmetnId),
        chat: {
          participants: {
            some: {
              userId: userId
            }
          }
        }
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        amountNaira: true,
        department: {
          select: {
            id: true,
            title: true,
            icon: true
          }
        },
        category: {
          select: {
            title: true,
            id: true,
            image: true
          }
        }
      }
    });
    if (!transactionGroupData) {
      return next(ApiError.notFound('TransactionGroupData not found'));

    }

    return new ApiResponse(200, transactionGroupData, 'TransactionGroupData found').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));

  }
}