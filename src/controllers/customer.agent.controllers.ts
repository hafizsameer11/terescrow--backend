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

    if (_user.role === UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    let allChats;

    if (_user.role === UserRoles.admin) {
      // Admin logic remains unchanged
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
        orderBy: {
          updatedAt: 'desc'
        }
      });
    } else {
      // Agent-specific logic
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

      // Remove duplicate participants manually
      allChats = allChats.map((chat) => {
        const uniqueParticipants = Array.from(
          new Map(
            chat.participants.map((participant) => [participant.user.id, participant])
          ).values()
        );

        return {
          ...chat,
          participants: uniqueParticipants,
        };
      });
    }

    if (!allChats || allChats.length === 0) {
      return next(ApiError.notFound('Chats not found'));
    }

    return new ApiResponse(200, allChats, 'Chats found').send(res);
  } catch (error) {
    console.error('Error in getAllChatsWithTeamController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occurred!'));
  }
};
