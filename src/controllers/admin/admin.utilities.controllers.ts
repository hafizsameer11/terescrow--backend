import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import {
  ChatType,
  Gender,
  PrismaClient,
  User,
  UserRoles,
} from '@prisma/client';
import { DepartmentStatus } from '@prisma/client';
import { hashPassword } from '../../utils/authUtils';
import { validationResult } from 'express-validator';
import { assign } from 'nodemailer/lib/shared';
import { create } from 'domain';

const prisma = new PrismaClient();

export const changeDepartmentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const admin: User = req.body._user;
    if (admin?.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const { departmentId } = req.body as { departmentId: string };

    const department = await prisma.department.findUnique({
      where: {
        id: parseInt(departmentId),
      },
    });

    if (!department) {
      return next(ApiError.badRequest('Department not found'));
    }

    if (department.status === DepartmentStatus.active) {
      await prisma.department.update({
        where: {
          id: parseInt(departmentId),
        },
        data: {
          status: DepartmentStatus.inactive,
        },
      });
      return new ApiResponse(200, null, 'Department status changed').send(res);
    } else {
      await prisma.department.update({
        where: {
          id: parseInt(departmentId),
        },
        data: {
          status: DepartmentStatus.active,
        },
      });
      return new ApiResponse(200, null, 'Department status changed').send(res);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to change department status'));
  }
};

export const getAgentsByDepartment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const admin: User = req.body._user;
    if (admin?.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const { departmentId } = req.body as { departmentId: string };
    const agents = await prisma.agent.findMany({
      where: {
        assignedDepartments: {
          some: {
            id: parseInt(departmentId),
          },
        },
      },
      select: {
        id: true,
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
    });

    if (!agents) {
      return next(ApiError.notFound('No agents found for this department'));
    }
    return new ApiResponse(200, agents, 'Agents fetched successfully').send(
      res
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch agents'));
  }
};

export const getAllTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const admin: User = req.body._user;
    if (admin?.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    // Extract query params for pagination, default to latest 10 transactions
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const latestOnly = !req.query.page && !req.query.limit;

    // Calculate the offset for pagination
    const skip = latestOnly ? 0 : (page - 1) * limit;
    const take = latestOnly ? 10 : limit;

    // Fetch transactions
    const transactions = await prisma.transaction.findMany({
      skip, // Skip records for pagination
      take, // Limit records returned
      orderBy: {
        createdAt: 'desc', // Sort by creation date
      },
      select: {
        id: true,
        department: {
          select: {
            id: true,
            title: true,
          },
        },
        category: {
          select: {
            id: true,
            title: true,
          },
        },
        agent: {
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
        customer: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    // Count total records for pagination
    const totalRecords = await prisma.transaction.count();

    // Build response based on mode
    const response = {
      currentPage: latestOnly ? 1 : page,
      totalPages: latestOnly ? 1 : Math.ceil(totalRecords / limit),
      totalRecords,
      transactionsData: transactions,
    };

    let message = latestOnly
      ? 'Latest 10 transactions fetched successfully'
      : 'Paginated transactions fetched successfully';

    if (transactions.length === 0) {
      message = 'No transactions found';
    }

    return new ApiResponse(200, response, message).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    console.error(error);
    next(ApiError.internal('Internal Server Error'));
  }
};

export const createAgentController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest(
        'Please enter valid credentials',
        errors.array()
      );
    }

    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      username,
      gender,
      country,
      departmentIds = [], // Default to empty array if not provided
    }: AgentRequest = req.body;

    // Check if user already exists
    const profilePicture = req.file ? req.file.filename : '';
    const isUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }, { phoneNumber }],
      },
    });

    if (isUser) {
      throw ApiError.badRequest('This user is already registered');
    }
    const hashedPassword = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email,
        phoneNumber,
        password: hashedPassword,
        username,
        gender,
        country,
        role: UserRoles.agent,
        profilePicture,
      },
    });

    if (!newUser) {
      return next(ApiError.internal('User creation failed'));
    }

    const newAgent = await prisma.agent.create({
      data: {
        userId: newUser.id,
        assignedDepartments: {
          createMany: {
            data: departmentIds.map((id) => ({
              departmentId: id,
            })),
          },
        },
      },
    });

    if (!newAgent) {
      return next(ApiError.internal('Agent creation failed'));
    }
    if (departmentIds.length > 0) {
      const assigned = await prisma.agent.update({
        where: {
          userId: newAgent.id,
        },
        data: {
          assignedDepartments: {
            createMany: {
              data: departmentIds.map((id) => ({
                departmentId: id,
              })),
            },
          },
        },
      });
      if (!assigned) {
        return next(ApiError.internal('Department assignment failed'));
      }
    }

    const allUsers = await prisma.user.findMany({
      where: {
        role: {
          not: UserRoles.customer,
        },
      },
    });

    const createdChats = await Promise.all(
      [...allUsers].map((user) =>
        prisma.chat.create({
          data: {
            chatType: ChatType.team_chat,
          },
          select: {
            id: true,
            chatType: true,
            createdAt: true, // Include other fields as needed
          },
        })
      )
    );

    if (!createdChats) {
      return next(ApiError.internal('Chat creation failed'));
    }

    for (const newChat of createdChats) {
      await Promise.all(
        allUsers.map(async (user) => {
          await prisma.chatParticipant.create({
            data: {
              chatId: newChat.id,
              userId: user.id,
            },
          });
        })
      );
    }

    return new ApiResponse(201, undefined, 'User created successfully').send(
      res
    );
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

interface AgentRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  username: string;
  gender: Gender; // Assuming an enum-like structure for gender
  country: string;
  role: UserRoles;
  departmentIds?: number[]; // Optional, can be empty or undefined
}
