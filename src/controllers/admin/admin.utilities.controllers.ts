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


/*
Agent COntroller

*/

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
    const departmentId = req.params.id;
    const agents = await prisma.agent.findMany({
      where: {
        assignedDepartments: {
          some: {
            departmentId: parseInt(departmentId)
          }
        },
      },
      select: {
        id: true,
        AgentStatus: true,
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
        profilePicture
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
    const { agentId } = req.params;
    const { firstName, lastName, email, phoneNumber, username, gender, country, departmentIds = [], status } = req.body;

    //check weather agent exists or not
    const agent = await prisma.agent.findUnique({
      where: { id: parseInt(agentId) },
    });
    if (!agent) {
      return next(ApiError.notFound('Agent not found'));
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: parseInt(agentId) },
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
        AgentStatus: {
          set: status
        },
      },
    });

    await prisma.assignedDepartment.deleteMany({
      where: { agentId: parseInt(agentId) },
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

/*


department controller


*/
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
export const getDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const department = await prisma.department.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        _count: {
          select: { assignedDepartments: true },
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
export const deleteDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const department = await prisma.department.delete({
      where: { id: parseInt(id) },
    });
    if (!department) {
      return next(ApiError.notFound('Department not found'));
    }
    return new ApiResponse(200, department, 'Department deleted successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}

export const getAlldepartments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: { assignedDepartments: true },
        },
      },
    });

    if (!departments) {
      return next(ApiError.notFound('Departments not found'));
    }

    // Transform the data structure
    const transformedDepartments = departments.map(department => ({
      id: department.id,
      title: department.title,
      description: department.description,
      icon: department.icon,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
      status: department.status,
      noOfAgents: department._count.assignedDepartments, // Flatten the `_count` field
    }));

    return new ApiResponse(200, transformedDepartments, 'Departments fetched successfully').send(res);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};


/*
Category Controller

*/

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, subtitle = '' } = req.body;

    // Ensure `departmentIds` is parsed correctly
    let departmentIds: number[] = [];

    if (typeof req.body.departmentIds === 'string') {
      departmentIds = JSON.parse(req.body.departmentIds);
    } else if (Array.isArray(req.body.departmentIds)) {
      departmentIds = req.body.departmentIds;
    }

    const image = req.file?.filename || '';

    const category = await prisma.category.create({
      data: {
        title,
        subTitle: subtitle,
        image,
      },
    });

    if (!category) {
      return next(ApiError.internal('Internal Server Error'));
    }

    if (departmentIds.length > 0) {
      let assignedCount = 0;

      await Promise.all(
        departmentIds.map(async (departmentId: number) => {
          const result = await prisma.catDepart.create({
            data: {
              categoryId: category.id,
              departmentId: departmentId,
            },
          });
          if (result) {
            assignedCount++;
          }
        })
      );

      if (assignedCount !== departmentIds.length) {
        return next(ApiError.internal('Failed to assign departments'));
      }
    }

    return new ApiResponse(200, category, 'Category created successfully').send(res);

  } catch (error) {
    console.error(error);

    if (error instanceof ApiError) {
      return next(error);
    }

    next(ApiError.internal('Internal Server Error'));
  }
};

export const editCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, departmentIds = [], subtitle = '' } = req.body;
    const image = req.file?.filename || '';
    const category = await prisma.category.update({
      where: {
        id: parseInt(id, 10)
      },
      data: {
        title,
        subTitle: subtitle,
        image
      }
    })
    if (!category) {
      return next(ApiError.badRequest('Category not found'));
    }
    if (departmentIds.length > 0) {
      let assignedCount = 0;
      await Promise.all(
        departmentIds.map(async (departmentId: number) => {
          const result = await prisma.catDepart.create({
            data: {
              categoryId: category.id,
              departmentId: departmentId
            }
          })
          if (result) {
            assignedCount++;
          }
        })
      )
      if (assignedCount !== departmentIds.length) {
        return next(ApiError.internal('Internal Server Error'));
      }
    }
    return new ApiResponse(200, category, 'Category updated successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));

  }
}
export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.delete({
      where: {
        id: parseInt(id, 10)
      }
    })

    const catDepart = await prisma.catDepart.deleteMany({
      where: {
        categoryId: category.id
      }
    });

    return new ApiResponse(200, category, 'Category deleted successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}
export const getallCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        departments: {
          select: {
            id: true,
            departmentId: true,
            department: {
              select: {
                title: true
              }
            }
          }
        }
      }
    });

    // Add image URL to each category
    const modifiedCategories = categories.map((category) => ({
      id: category.id,
      title: category.title,
      subTitle: category.subTitle,
      image: category.image
        ? `${req.protocol}://${req.get('host')}/uploads/${category.image}`
        : null,
      departments: category.departments.map((dept) => ({
        id: dept.id,
        departmentId: dept.departmentId,
        title: dept.department.title,
      })),
    }));

    return new ApiResponse(200, modifiedCategories, 'Categories fetched successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};


export const getSingleCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Fetch the category with related departments
    const category = await prisma.category.findUnique({
      where: {
        id: parseInt(id, 10)
      },
      include: {
        departments: {
          select: {
            department: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      }
    });

    // Handle case when category is not found
    if (!category) {
      return next(ApiError.badRequest('Category not found'));
    }

    // Restructure the response for better format
    const modifiedCategory = {
      id: category.id,
      title: category.title,
      subTitle: category.subTitle,
      image: category.image
        ? `${req.protocol}://${req.get('host')}/uploads/${category.image}`
        : null,
      departments: category.departments.map((dept) => dept.department),
    };

    return new ApiResponse(200, modifiedCategory, 'Category fetched successfully').send(res);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
};

//subcategory routes



/*
Sub category Contrller

*/
export const createSubCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, price, catIds = [] } = req.body;
    const subCategory = await prisma.subcategory.create({
      data: {
        title,
        price,
      }
    });


    if (!subCategory) {
      return next(ApiError.internal('Internal Server Error'));
    }
    if (catIds.length > 0) {
      let assignedCount = 0;
      await Promise.all(
        catIds.map(async (catid: number) => {
          const result = await prisma.catSubcat.create({
            data: {
              categoryId: catid,
              subCategoryId: subCategory.id
            },
          });

          if (result) {
            assignedCount++;
          }
        })
      );

      if (assignedCount !== catIds.length) {
        return next(ApiError.internal('Department assignment failed'));
      }
    }
    return new ApiResponse(200, subCategory, 'SubCategory created successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}
export const getallSubCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subCategories = await prisma.subcategory.findMany({
      include: {
        catSubcat: {
          select: {
            category: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
      },
    });
    if (!subCategories) {
      return new ApiResponse(201, [], 'No subCategories found').send(res);
    }
    const modifiedSubCategories = subCategories.map((subCategory) => {
      return {
        id: subCategory.id,
        title: subCategory.title,
        price: subCategory.price,
        categories: subCategory.catSubcat.map((catSubcat) => {
          return {
            id: catSubcat.category.id,
            title: catSubcat.category.title
          }
        }),
      }
    })
    // })
    return new ApiResponse(200, modifiedSubCategories, 'SubCategories retrieved successfully').send(res);
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Internal Server Error'));
  }
}



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
