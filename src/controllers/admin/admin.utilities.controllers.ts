import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import { Gender, PrismaClient, User, UserRoles } from '@prisma/client';
import { DepartmentStatus, AssignedDepartment } from '@prisma/client';
import { hashPassword } from '../../utils/authUtils';
import { UserRequest } from '../customer/auth.controllers';
import { validationResult } from 'express-validator';
import upload from '../../middlewares/multer.middleware';

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
export const createAgent = async (req: Request, res: Response, next: NextFunction) => {
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
      },
    });

    if (!newUser) {
      return next(ApiError.internal('User creation failed'));
    }
    const newAgent = await prisma.agent.create({
      data: {
        userId: newUser.id,
      },
    })
    if (!newAgent) {
      return next(ApiError.internal('Agent creation failed'));
    }
    if (departmentIds.length > 0) {
      let assignedCount = 0;
      await Promise.all(
        departmentIds.map(async (departmentId) => {
          const result = await prisma.assignedDepartment.create({
            data: {
              agentId: newAgent.id,
              departmentId: departmentId,
            },
          });

          if (result) {
            assignedCount++;
          }
        })
      );

      if (assignedCount !== departmentIds.length) {
        return next(ApiError.internal('Department assignment failed'));
      }
    }

    return new ApiResponse(
      200,
      undefined,
      'User created successfully'
    ).send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

export const editAgent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId, firstName, lastName, email, phoneNumber, username, gender, country, departmentIds = [] } = req.body;

    //check weather agent exists or not
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      return next(ApiError.notFound('Agent not found'));
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        user: {
          update: {
            firstname: firstName,
            lastname: lastName,
            email,
            phoneNumber,
            username,
            gender,
            country,
          },
        },
      },
    });

    await prisma.assignedDepartment.deleteMany({
      where: { agentId },
    });

    if (departmentIds.length > 0) {
      await prisma.assignedDepartment.createMany({
        data: departmentIds.map((departmentId: number) => ({
          agentId,
          departmentId,
        })),
        skipDuplicates: true,
      });
    }

    return new ApiResponse(200, updatedAgent, 'Agent updated successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }

}
export const getAgent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await prisma.agent.findUnique({
      where: { id: parseInt(agentId) },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
            email: true
          },
        },
        assignedDepartments: {
          select: {
            department: {
              select: {
                title: true,
                id: true

              }
            }
          }
        }
      },
    });
    if (!agent) {
      return next(ApiError.notFound('Agent not found'));
    }
    return new ApiResponse(200, agent, 'Agent fetched successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }

}
export const deleteAgemt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await prisma.agent.delete({
      where: { id: parseInt(agentId) },
    });
    //after deleting agent delete the recordss froma assigned department
    const assignedDepartments = await prisma.assignedDepartment.deleteMany({
      where: { agentId: parseInt(agentId) },
    });
    if (!agent) {
      return next(ApiError.notFound('Agent not found'));
    }
    return new ApiResponse(200, agent, 'Agent deleted successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}

// department creation routes
export const createDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, status } = req.body;

    const icon = req.file?.fieldname || '';
    const department = await prisma.department.create({
      data: {
        title,
        description,
        icon,
        status
      }
    })
    if (!department) {
      return next(ApiError.internal('Internal Server Error'));
    }
    return new ApiResponse(200, department, 'Department created successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}
//department edit route
export const editDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;
    const icon = req.file?.fieldname || '';
    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        icon,
        status
      }
    })
    if (!department) {
      return next(ApiError.internal('Internal Server Error'));
    }
    return new ApiResponse(200, department, 'Department updated successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}
//get single department with agents assigned to it and their count
export const getDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const department = await prisma.department.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        _count: {
          select: { assignedDepartments: true }, // Include the count of assignedDepartments
        },
      },
    });

    if (!department) {
      return next(ApiError.notFound('Department not found'));
    }
    const response = {
      id: department.id,
      title: department.title,
      description: department.description,
      noOfAgents: department._count?.assignedDepartments || 0,
    };
    return new ApiResponse(200, response, 'Department fetched successfully').send(res);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};
///
interface AgentRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  username: string;
  gender: Gender; // Assuming an enum-like structure for gender
  country: string;
  role: 'ADMIN' | 'AGENT' | 'CUSTOMER';
  departmentIds?: number[]; // Optional, can be empty or undefined
}
