import { Request, Response, NextFunction } from 'express';
import { ChatType, PrismaClient, User, UserRoles } from '@prisma/client';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';

const prisma = new PrismaClient();

export const getAllChatsWithTeamController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const _user: User = req.body._user;

    if (_user.role == UserRoles.customer) {
      return ApiError.unauthorized('You are not authorized');
    }

    let allChats;

    if (_user.role == UserRoles.admin) {
      allChats = await prisma.chat.findMany({
        where: {
          OR: [
            {
              AND: [
                {
                  participants: {
                    some: {
                      userId: _user.id,
                    },
                  },
                },
                { chatType: ChatType.team_chat },
              ],
            },
            { chatType: ChatType.group_chat },
          ],
        },
        select: {
          id: true,
          chatType: true,
          _count: {
            select: {
              messages: {
                where: {
                  isRead: false,
                },
              },
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
          chatGroup: {
            select: {
              groupName: true,
              groupProfile: true,
              adminId: true,
            },
          },
        },
      });
    } else {
      allChats = await prisma.chat.findMany({
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
              messages: {
                where: {
                  isRead: false,
                },
              },
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
          chatGroup: {
            select: {
              groupName: true,
              groupProfile: true,
              adminId: true,
            },
          },
        },
      });
    }

    if (!allChats) {
      return next(ApiError.notFound('Chats not found'));
    }

    return new ApiResponse(200, allChats, 'Chats found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};
