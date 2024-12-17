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

      chatId,
      cardType,
      cardNumber,
      amount,
      departmentId,
      categoryId,
      exchangeRate,
      amountNaira,
    } = req.body;
    if (!subCategoryId || !amount || !chatId) {
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
        cardType: cardType || null,
        cardNumber: cardNumber || null,
        departmentId: parseInt(departmentId, 10),
        categoryId: parseInt(categoryId, 10),
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
    console.log(req.body);
    const agent: User = req.body._user;
    if (!agent || agent.role !== UserRoles.agent) {
      return next(ApiError.unauthorized('Unauthorized'));
    }

    const {
      departmentId,
      categoryId,
      subCategoryId,
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
        amount: parseFloat(amount),
        departmentId: parseInt(departmentId, 10),
        categoryId: parseInt(categoryId, 10),
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


/**
 * 
 * 
 * 
 * Transaction controller
 * 
 * 
 */


export const getAgentTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const agent: User = req.body._user;

    if (!agent || agent.role !== UserRoles.agent) {
      return next(ApiError.badRequest('Invalid user'));
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        chat: {
          participants: {
            some: {
              userId: agent.id, // Ensure the agent is a participant
            },
          },
        },
      },
      include: {
        chat: {
          select: {
            participants: {
              where: {
                NOT: { userId: agent.id }, // Exclude current agent
              },
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                    firstname: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        department: true,
        category: true,
      },
    });

    if (!transactions || transactions.length === 0) {
      return next(ApiError.notFound('Transactions not found'));
    }

    // Map transactions to match the expected API response
    const mappedTransactions = transactions.map((transaction) => ({
      id: transaction.id,
      chatId: transaction.chatId,
      subCategoryId: transaction.subCategoryId,
      countryId: transaction.countryId,
      cardType: transaction.cardType,
      departmentId: transaction.departmentId,
      categoryId: transaction.categoryId,
      cardNumber: transaction.cardNumber,
      amount: transaction.amount,
      exchangeRate: transaction.exchangeRate,
      amountNaira: transaction.amountNaira,
      cryptoAmount: transaction.cryptoAmount,
      fromAddress: transaction.fromAddress,
      toAddress: transaction.toAddress,
      status: transaction.status,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,

      // Map customer directly from chat participants
      customer:
        transaction.chat.participants.length > 0
          ? transaction.chat.participants[0].user
          : null,

      department: transaction.department || null,
      category: transaction.category || null,
    }));

    return new ApiResponse(
      200,
      mappedTransactions,
      'Transactions found successfully'
    ).send(res);

  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
};


/// agent stats
export const getAgentStats = async (req: Request, res: Response, next: NextFunction) => {

  try {
    const user: User = req.body._user;
    const agentId = user.id;
    const totalChats = await prisma.chat.count({
      where: {
        chatType: ChatType.customer_to_agent,
        participants: {
          some: {
            userId: agentId
          }
        }
      }
    })
    const successfulllTransactions = await prisma.transaction.count({
      where: {
        chat: {
          participants: {
            some: {
              userId: agentId,
            },
          },
        },
        status: TransactionStatus.successful,
      },
    });
    const pendingChats = await prisma.chat.count({
      where: {
        participants: {
          some: {
            userId: agentId,
          },
        },
        chatDetails: {
          status: ChatStatus.pending,
        },
      },
    });
    const declinedChats = await prisma.chat.count({
      where: {
        participants: {
          some: {
            userId: agentId,
          },
        },
        chatDetails: {
          status: ChatStatus.declined,
        },
      },
    });
    const data = {
      totalChats: totalChats,
      successfulllTransactions: successfulllTransactions,
      pendingChats: pendingChats,
      declinedChats: declinedChats
    }
    return new ApiResponse(
      200,
      data,
      'Stats found successfully'
    ).send(res);


  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Internal Server Error'));
  }
}