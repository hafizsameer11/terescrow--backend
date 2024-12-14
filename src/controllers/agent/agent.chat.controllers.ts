import { NextFunction, Request, Response } from 'express';
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
import { getCustomerSocketId } from '../../socketConfig';
import { io } from '../../socketConfig';

const prisma = new PrismaClient();

export const sendToCustomerController = async (
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

    if (sender.role !== UserRoles.agent) {
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
                userId: sender.id,
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

    if (!newMessage) {
      return next(ApiError.internal('Message Sending Failed'));
    }

    // if (!chat.messages.includes(newMessage._id)) {
    //   chat.messages.push(newMessage._id);
    //   await chat.save();
    // }

    // its to check whether the user is online or offline now
    //io.to is used to send message to a particular user

    const recieverSocketId = getCustomerSocketId(newMessage.receiverId);
    if (recieverSocketId) {
      io.to(recieverSocketId).emit('message', {
        from: sender.id,
        message: newMessage,
      });
      console.log('sent to customer');
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

export const changeChatStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const agent: User = req.body._user;
    if (agent.role !== UserRoles.agent) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { chatId, setStatus } = req.body as {
      chatId: string;
      setStatus: ChatStatus;
    };

    if (!chatId || !setStatus || ChatStatus[setStatus] === undefined) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: Number(chatId),
      },
      select: {
        chatDetails: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!chat) {
      return next(ApiError.notFound('chat not found'));
    }

    if (chat.chatDetails?.status === setStatus) {
      return next(ApiError.badRequest('chat status already set'));
    }

    await prisma.chat.update({
      where: {
        id: Number(chatId),
      },
      data: {
        chatDetails: {
          update: {
            status: setStatus,
          },
        },
      },
    });
    return new ApiResponse(
      200,
      undefined,
      'Chat Status set to ' + ChatStatus[setStatus]
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const sendToTeamController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user, message, chatId } = req.body._user as TeamMessageReq;

    if (!_user || _user.role === UserRoles.customer) {
      return ApiError.unauthorized('You are not authorized');
    }

    const chat = await prisma.chat.findFirst({
      where: {
        AND: [
          { id: +chatId },
          {
            OR: [
              { chatType: ChatType.team_chat },
              { chatType: ChatType.group_chat },
            ],
          },
        ],
      },
      select: {
        id: true,
        participants: {
          where: {
            userId: {
              not: _user.id,
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
        senderId: _user.id,
        receiverId: chat.participants[0].userId,
        message,
      },
    });

    if (!newMessage) {
      return next(ApiError.internal('Message Sending Failed'));
    }

    return new ApiResponse(201, newMessage, 'Message sent successfully').send(
      res
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const getAllChatsWithCustomerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user } = req.body as { _user: User };
    // console.log(_user);

    if (!_user) {
      return ApiError.unauthorized('You are not authorized');
    }

    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: _user.id,
              },
            },
          },
          { chatType: ChatType.customer_to_agent },
        ],
      },
      select: {
        id: true,
        chatType: true,
        _count: {
          select: {
            messages: true,
          },
        },
        chatDetails: {
          select: {
            status: true,
          },
        },
        participants: {
          where: {
            userId: {
              not: _user.id,
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
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // console.log(chats);

    if (!chats) {
      return next(ApiError.notFound('Chats not found'));
    }

    // console.log(chats);
    const resData = chats.map((chat) => {
      const recentMessage = chat.messages?.[0]?.message || null;
      const recentMessageTimestamp = chat.messages?.[0]?.createdAt || null;
      const customer = chat.participants?.[0]?.user || null;
      const chatStatus = chat.chatDetails?.status || null;
      const messagesCount = chat._count?.messages || 0;

      return {
        id: chat.id,
        customer, // Ensure customer is not undefined
        recentMessage, // Handle missing messages gracefully
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
      };
    });

    return new ApiResponse(200, resData, 'Chats found').send(res);
  } catch (error) {
    console.log('jumped here');
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const getAllChatsWithTeamController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user } = req.body as { _user: User };

    if (!_user) {
      return ApiError.unauthorized('You are not authorized');
    }

    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: _user.id,
              },
            },
          },
          {
            OR: [
              { chatType: ChatType.team_chat },
              { chatType: ChatType.group_chat },
            ],
          },
        ],
      },
      select: {
        id: true,
        chatType: true,
        _count: {
          select: {
            messages: true,
          },
        },
        participants: {
          where: {
            userId: {
              not: _user.id,
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
        chatGroup: {
          select: {
            groupName: true,
            groupProfile: true,
            adminId: true,
          },
        },
      },
    });

    if (!chats) {
      return next(ApiError.notFound('Chats not found'));
    }

    return new ApiResponse(200, chats, 'Chats found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const getChatDetailsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { chatId } = req.params;
    const user: User = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: Number(chatId),
      },
      include: {
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
        chatDetails: true,
        chatGroup: true,
        messages: true,
      },
    });

    if (!chat) {
      return next(ApiError.notFound('Chat not found'));
    }
    const {
      messages,
      participants,
      chatDetails,
      chatGroup,
      id,
      chatType,
      createdAt,
      updatedAt,
    } = chat;

    // console.log(participants);
    if (chat.chatType == ChatType.customer_to_agent && chat.chatDetails) {
      const resData = {
        id,
        customer: participants[0].user,
        messages,
        chatDetails,
        chatType,
        createdAt,
        updatedAt,
      };
      return new ApiResponse(200, resData, 'Chat found').send(res);
    }

    return new ApiResponse(200, chat, 'Chat found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

interface TeamMessageReq {
  _user: User;
  message: string;
  chatId: number;
}
