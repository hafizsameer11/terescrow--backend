import { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  ChatStatus,
  ChatType,
  PrismaClient,
  User,
  UserRoles,
} from '@prisma/client';
import { TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

export const createTransactionCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract agentId from auth middleware
    const agent: User = req.body._user;
    if (!agent || agent.role !== UserRoles.agent) {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const agentData = await prisma.agent.findUnique({
      where: {
        userId: agent.id,
      },
      select: {
        id: true,
      },
    });

    if (!agentData) {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const agentId = agentData.id;
    const {
      departmentId,
      categoryId,
      subCategoryId,
      countryId,
      customerId,
      cardType,
      cardNumber,
      amount,
      exchangeRate,
      amountNaira,
      status,
    } = req.body;
    if (
      !departmentId ||
      !categoryId ||
      !subCategoryId ||
      !countryId ||
      !amount ||
      !customerId
    ) {
      return next(ApiError.badRequest('Missing required fields'));
    }
    const transaction = await prisma.transaction.create({
      data: {
        departmentId: parseInt(departmentId, 10),
        categoryId: parseInt(categoryId, 10),
        subCategoryId: parseInt(subCategoryId, 10),
        countryId: parseInt(countryId, 10),
        cardType: cardType || null,
        cardNumber: cardNumber || null,
        amount: parseFloat(amount),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
        amountNaira: amountNaira ? parseFloat(amountNaira) : null,
        agentId, // From the authenticated user
        status: TransactionStatus.successful,
        customerId: parseInt(customerId, 10),
      },
    });
    if (!transaction) {
      return next(ApiError.badRequest('Transaction not created'));
    }

    const chatDetailsUpdate = await prisma.chatDetails.updateMany({
      where: {
        AND: [
          { departmentId: departmentId },
          { categoryId: categoryId },
          { status: ChatStatus.pending },
          {
            chat: {
              AND: [
                {
                  participants: { some: { userId: agentId } },
                },
                { participants: { some: { userId: customerId } } },
              ],
            },
          },
        ],
      },
      data: {
        status: ChatStatus.successful,
      },
    });

    return new ApiResponse(
      201,
      undefined,
      'Transaction created successfully'
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

export const createTransactionCrypto = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract agentId from auth middleware
    const agent: User = req.body._user;
    if (!agent || agent.role !== UserRoles.agent) {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const agentData = await prisma.agent.findUnique({
      where: {
        userId: agent.id,
      },
      select: {
        id: true,
      },
    });

    if (!agentData) {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const agentId = agentData.id;
    const {
      departmentId,
      categoryId,
      subCategoryId,
      countryId,
      customerId,
      amount,
      exchangeRate,
      amountNaira,
      cryptoAmount,
      fromAddress,
      toAddress,
      status,
    } = req.body;

    // Validate required fields
    if (
      !departmentId ||
      !categoryId ||
      !subCategoryId ||
      !countryId ||
      !amount ||
      !customerId ||
      !exchangeRate
    ) {
      return next(ApiError.badRequest('Missing required fields'));
    }

    // Create a new transaction
    const transaction = await prisma.transaction.create({
      data: {
        departmentId: parseInt(departmentId, 10),
        categoryId: parseInt(categoryId, 10),
        subCategoryId: parseInt(subCategoryId, 10),
        countryId: parseInt(countryId, 10),
        cardType: null,
        cardNumber: null,
        amount: parseFloat(amount),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
        amountNaira: amountNaira ? parseFloat(amountNaira) : null,
        agentId,
        cryptoAmount: cryptoAmount ? parseFloat(cryptoAmount) : null,
        fromAddress: fromAddress || null,
        toAddress: toAddress || null,
        status: status || 'pending', // Default status if not provided
        customerId: parseInt(customerId, 10),
      },
    });
    if (!transaction) {
      return next(ApiError.badRequest('Transaction not created'));
    }
    return new ApiResponse(
      201,
      undefined,
      'Transaction created successfully'
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
