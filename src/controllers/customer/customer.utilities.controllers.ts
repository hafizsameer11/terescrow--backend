import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { PrismaClient, User } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const customer: User = req.body._user;
    if (!customer || customer.role !== 'customer') {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        customerId: customer.id,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // res.json(transactions);
    return new ApiResponse(
      200,
      transactions,
      'Transactions fetched successfully'
    ).send(res);
  } catch (error) {
    // console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
  //get 10 latest transactions
  // const latestTransactions = transactions.slice(-10);
};
