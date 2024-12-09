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
import { send } from 'process';

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

    if (!message.trim() || chatId) {
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
        from: sender.username,
        message,
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

export const sendToTeamController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user, message, chatId } = req.body._user as TeamMessageReq;

    if (!_user) {
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
      return next(ApiError.notFound('Chats not found'));
    }

    const resData = chats.map((chat) => {
      return {
        id: chat.id,
        receiver: chat.participants[0].user,
        recentMessage: chat.messages[0].message,
      };
    });

    return new ApiResponse(200, resData, 'Chats found').send(res);
  } catch (error) {
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
          select: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        messages: true,
      },
    });

    if (!chat) {
      return next(ApiError.notFound('Chat not found'));
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
