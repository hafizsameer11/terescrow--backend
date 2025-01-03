import { Request, Response, NextFunction } from 'express';
import { ChatType, InAppNotificationType, PrismaClient, User, UserRoles } from '@prisma/client';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { getAgentOrAdminSocketId, io } from '../socketConfig';

const prisma = new PrismaClient();

export const sendMessageToTeamController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user, message, chatId } = req.body as TeamMessageReq;
    console.log(_user, message, chatId);
    const image = req.file?.filename || '';

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
        chatType: true,
        participants: {
          where: {
            userId: {
              not: _user.id,
            },

          },
        },
      },
    });
    if (!chat || chat.chatType === ChatType.customer_to_agent) {
      return next(ApiError.notFound('Failed to find chat'));
    }
    const newMessage = await prisma.message.create({
      data: {
        senderId: _user.id,
        chatId: chat.id,
        message: message || '',
        image: image || '',
        receiverId:
          chat.chatType === ChatType.team_chat
            ? chat.participants?.[0].userId
            : null,
      },
    });
    const notification = await prisma.inAppNotification.create({
      data: {
        userId: chat.participants?.[0].userId,
        description: `${_user.username} sent you a message`,
        title: `${_user.username} sent you a message`,
        type: InAppNotificationType.team,
      }
    })
    const accountActivity = await prisma.accountActivity.create({
      data: {
        userId: _user.id,
        description: `${_user.username} Sent a message to ${chat.participants?.[0].chatId}`,
      }
    })
    if (chat.chatType === ChatType.team_chat) {
      const recieverSocketId = getAgentOrAdminSocketId(newMessage.receiverId!);
      if (recieverSocketId) {
        io.to(recieverSocketId).emit('message', {
          from: newMessage.senderId,
          message: newMessage,
        });
        console.log('sent to team');
      }
    } else {
      for (const participant of chat.participants) {
        const recieverSocketId = getAgentOrAdminSocketId(participant.userId!);
        if (recieverSocketId) {
          io.to(recieverSocketId).emit('message', {
            from: newMessage.senderId,
            message: newMessage,
          });
        }
      }
      console.log('sent to group');
    }
    const updateChatUpdatedAt = await prisma.chat.update({
      where: {
        id: chat.id,
      },
      data: {
        updatedAt: new Date(),
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

export const getTeamChatDetailsController = async (
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
        _count: {
          select: {
            messages: true,
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
                username: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
              },
            },
          },
        },
        chatDetails: {
          include: {
            department: true,
            category: true,
          },
        },
        chatGroup: true,
        messages: true,
      },
    });

    if (!chat || chat.chatType == ChatType.customer_to_agent) {
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
