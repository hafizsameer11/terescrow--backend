import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  Chat,
  PrismaClient,
  UserRoles,
  User,
  ChatType,
  ChatStatus,
} from '@prisma/client';
import { getAgentSocketId, getCustomerSocketId, io } from '../../socketConfig';

const prisma = new PrismaClient();

const sendMessageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message = '', // Default to empty string
      chatId,
      _user: sender,
    } = req.body as { message?: string; chatId: string; _user: User };

    console.log(req.file);
    console.log(req.body);

    // Check authorization
    if (sender.role !== UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    // Validate input
    if (!chatId || (!message.trim() && !req.file)) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    // Extract image filename if present
    const image = req.file?.filename || '';

    // Find chat
    const chat = await prisma.chat.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: +sender.id,
              },
            },
          },
          { id: +chatId },
          {
            chatType: ChatType.customer_to_agent,
          },
        ],
      },
      select: {
        id: true,
        participants: {
          where: {
            userId: {
              not: sender.id,
            },
          },
        },
      },
    });

    if (!chat) {
      return next(ApiError.notFound('This chat does not exist'));
    }

    // Create new message
    const newMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId: chat.participants[0].userId,
        image: image || undefined, // Include only if exists
        message: message.trim() || '', // Include only if exists
      },
    });

    // console.log(notification);
    // Update chat `updatedAt`
    await prisma.chat.update({
      where: {
        id: chat.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    // Create in-app notification
    await prisma.inAppNotification.create({
      data: {
        userId: chat.participants[0].userId,
        title: 'New Message',
        description: `You have a new message from ${sender.firstname} ${sender.lastname}`,
      },
    });

    if (!newMessage) {
      return next(ApiError.internal('Message sending failed'));
    }

    // Emit socket event
    const receiverSocketId = getAgentSocketId(chat.participants[0].userId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message', {
        from: sender.id,
        message: newMessage,
      });
    }

    return new ApiResponse(201, newMessage, 'Message sent successfully').send(
      res
    );
  } catch (error) {
    console.error(error);
    return next(
      error instanceof ApiError
        ? error
        : ApiError.internal('Server Error Occurred!')
    );
  }
};


const getChatDetailsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { chatId } = req.params;
    const user: User = req.body._user;

    console.log(user.role);
    console.log(chatId);
    if (user.role !== UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    if (!chatId) {
      return next(ApiError.badRequest('Chat not found'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: parseInt(chatId),
      },
      select: {
        id: true,
        chatType: true,
        participants: {
          where: {
            userId: {
              not: user.id,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        chatDetails: {
          select: {
            status: true,
          },
        },
      },
    });
    if (chat) {
      const updatedMessages = await prisma.message.updateMany({
        where: {
          AND: [
            {
              chatId: chat.id,
            },
            {
              receiverId: user.id,
            }
          ]
        },
        data: {
          isRead: true,
        },
      });

      if (updatedMessages) {
        console.log("messages updated");
      }
    }
    if (!chat) {
      return next(ApiError.badRequest('Chat not found'));
    }
    return new ApiResponse(
      200,
      {
        id: chat.id,
        chatType: chat.chatType,
        receiverDetails: chat.participants[0].user,
        status: chat.chatDetails?.status,
        messages: chat.messages || null,
      },
      'Chat found successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

const getAllChatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      select: {
        id: true,

        chatDetails: {

          select: {
            status: true,
            category: true,
            department: true,
          },
        },
        participants: {
          where: {
            userId: {
              not: user.id,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
        transactions: true,
        _count: {

          select: {
            messages: {
              where: {
                isRead: false,
                receiverId: user.id
              },

            },

          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },


      },
      orderBy: {
        updatedAt: 'desc',
      },

    });

    if (!chats) {
      return next(ApiError.notFound('No chats were found'));
    }

    const responseData = chats.map((chat) => {
      const recentMessage = chat.messages?.[0]?.message || null;
      const recentMessageTimestamp = chat.messages?.[0]?.createdAt || null;
      const agent = chat.participants?.[0]?.user || null;
      const chatStatus = chat.chatDetails?.status || null;
      const messagesCount = chat._count?.messages || 0;
      const department = chat.chatDetails?.department || null;
      const transaction = chat.transactions?.[0] || null;
      const category = chat.chatDetails?.category || null;
      return {
        id: chat.id,
        agent, // Ensure customer is not undefined
        recentMessage, // Handle missing messages gracefully
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
        department,
        transaction,
        category
      };
    });

    return new ApiResponse(
      200,
      responseData,
      'Chats fetched successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};


export {
  getChatDetailsController,
  getAllChatsController,
  sendMessageController,
};