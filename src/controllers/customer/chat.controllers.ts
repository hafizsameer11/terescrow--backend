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
      message,
      chatId,
      _user: sender,
    } = req.body as { message: string; chatId: string; _user: User };

    // console.log(message, chatId, sender);

    if (sender.role !== UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    if (!message.trim() || !chatId) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

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
      return next(ApiError.notFound('this chat does not exist'));
    }

    const newMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId: chat.participants[0].userId,
        message,
      },
    });

    //create nofiticaion for the receiver
    const notification=await prisma.inAppNotification.create({
      data:{
        userId:chat.participants[0].userId,
        title:"New Message",
        description:`You have a new message from ${sender.firstname} ${sender.lastname}`,
      }
    });
    
    if (!newMessage) {
      return next(ApiError.internal('Message Sending Failed'));
    }

    // its to check whether the user is online or offline now
    //io.to is used to send message to a particular user

    console.log(chat.participants[0].userId);
    const recieverSocketId = getAgentSocketId(chat.participants[0].userId);
    if (recieverSocketId) {
      console.log('reached');
      io.to(recieverSocketId).emit('message', {
        from: sender.id,
        message: newMessage,
      });
      console.log('emitted');
    }

    return new ApiResponse(201, newMessage, 'Message sent successfully').send(
      res
    );
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
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

    console.log(chat?.messages);
    if (!chat) {
      return next(ApiError.badRequest('Chat not found'));
    }
    console.log({
      id: chat.id,
      chatType: chat.chatType,
      receiverDetails: chat.participants[0].user,
      status: chat.chatDetails?.status,
      messages: chat.messages || null,
    },)
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
        _count: {
          select: {
            messages: {
              where: {
                isRead: false,
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
      return {
        id: chat.id,
        agent, // Ensure customer is not undefined
        recentMessage, // Handle missing messages gracefully
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
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

// interface MessageRequest {
//   _user: User;
//   receiverId: User['id'];
//   message: string;
//   categoryId: number;
//   departmentId: number;
// }
