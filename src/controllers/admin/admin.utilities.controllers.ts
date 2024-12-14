import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import { PrismaClient, User, UserRoles } from '@prisma/client';
import { DepartmentStatus } from '@prisma/client';

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
