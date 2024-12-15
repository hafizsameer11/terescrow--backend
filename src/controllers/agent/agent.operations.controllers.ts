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
import { getCustomerSocketId, io } from '../../socketConfig';

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

    const {
      subCategoryId,
      countryId,
      chatId,
      cardType,
      cardNumber,
      amount,
      exchangeRate,
      amountNaira,
    } = req.body;
    if (!subCategoryId || !countryId || !amount || !chatId) {
      return next(ApiError.badRequest('Missing required fields'));
    }

    const currChat = await prisma.chat.findUnique({
      where: {
        id: chatId,
        participants: {
          some: {
            userId: agent.id,
          },
        },
        chatDetails: {
          status: ChatStatus.pending,
        },
      },
      select: {
        participants: {
          select: {
            user: {
              select: {
                id: true,
                agent: true,
              },
            },
          },
        },
      },
    });

    if (!currChat || currChat.participants.length === 0) {
      return next(ApiError.notFound('Chat not found'));
    }

    const transaction = await prisma.transaction.create({
      data: {
        chatId: parseInt(chatId, 10),
        subCategoryId: parseInt(subCategoryId, 10),
        countryId: parseInt(countryId, 10),
        cardType: cardType || null,
        cardNumber: cardNumber || null,
        amount: parseFloat(amount),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
        amountNaira: amountNaira ? parseFloat(amountNaira) : null,
        status: TransactionStatus.pending,
      },
    });
    if (!transaction) {
      return next(ApiError.badRequest('Transaction not created'));
    }

    const updatedChat = await prisma.chat.update({
      where: {
        id: chatId,
      },
      data: {
        chatDetails: {
          update: {
            status: ChatStatus.successful,
          },
        },
      },
    });

    if (!updatedChat) {
      return next(ApiError.badRequest('Chat not updated'));
    }

    const currCustomer = currChat.participants.find(
      (participant) => participant.user.id !== agent.id
    );

    const currCustomerId = currCustomer?.user?.id;

    //dispatch event to customer
    const customerSocketId = getCustomerSocketId(currCustomerId!);
    if (customerSocketId) {
      io.to(customerSocketId).emit('chat-successful', {
        chatId: +chatId,
      });
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

    const {
      departmentId,
      categoryId,
      subCategoryId,
      countryId,
      chatId,
      amount,
      exchangeRate,
      amountNaira,
      cryptoAmount,
      fromAddress,
      toAddress,
    } = req.body;

    // Validate required fields
    if (
      !departmentId ||
      !categoryId ||
      !subCategoryId ||
      !countryId ||
      !amount ||
      !chatId ||
      !exchangeRate
    ) {
      return next(ApiError.badRequest('Missing required fields'));
    }

    //extract agent and userId from chat Id
    const currChat = await prisma.chat.findUnique({
      where: {
        id: chatId,
        participants: {
          some: {
            userId: agent.id,
          },
        },
        chatDetails: {
          status: ChatStatus.pending,
        },
      },
      select: {
        participants: {
          select: {
            user: {
              select: {
                id: true,
                agent: true,
              },
            },
          },
        },
      },
    });

    if (!currChat || currChat.participants.length === 0) {
      return next(ApiError.notFound('Chat not found'));
    }

    // Create a new transaction
    const transaction = await prisma.transaction.create({
      data: {
        chatId: parseInt(chatId, 10),
        subCategoryId: parseInt(subCategoryId, 10),
        countryId: parseInt(countryId, 10),
        amount: parseFloat(amount),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
        amountNaira: amountNaira ? parseFloat(amountNaira) : null,
        cryptoAmount: cryptoAmount ? parseFloat(cryptoAmount) : null,
        fromAddress: fromAddress || null,
        toAddress: toAddress || null,
        status: TransactionStatus.pending,
      },
    });
    if (!transaction) {
      return next(ApiError.badRequest('Failed to create transaction'));
    }

    const updatedChat = await prisma.chat.update({
      where: {
        id: chatId,
      },
      data: {
        chatDetails: {
          update: {
            status: ChatStatus.successful,
          },
        },
      },
    });

    if (!updatedChat) {
      return next(ApiError.badRequest('Chat not updated'));
    }

    const currCustomer = currChat.participants.find(
      (participant) => participant.user.id !== agent.id
    );
    const currCustomerId = currCustomer?.user.id;

    const customerSocketId = getCustomerSocketId(currCustomerId!);
    if (customerSocketId) {
      io.to(customerSocketId).emit('chat-successful', {
        chatId: +chatId,
      });
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
