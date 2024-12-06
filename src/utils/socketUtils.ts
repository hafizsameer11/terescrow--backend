import { PrismaClient, UserRoles } from '@prisma/client';
import ApiError from './ApiError';
const primsa = new PrismaClient();

const getAgentDepartmentAndAgentId = async (
  userId: number
): Promise<{
  agentId: number;
  assignedDepartments: { id: number }[];
} | null> => {
  try {
    const isAgent = await primsa.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        agent: {
          select: {
            id: true,
            assignedDepartments: {
              select: { id: true },
            },
          },
        },
      },
    });
    if (!isAgent || !isAgent.agent) return null;
    return {
      agentId: isAgent.agent.id,
      assignedDepartments: isAgent.agent.assignedDepartments,
    };
  } catch (error) {
    console.log(error);
    return null;
    // throw ApiError.badRequest('Internal server error');
  }
};

const createNewChat = async (
  agentId: number,
  customerId: number,
  departmentId: number,
  categoryId: number
) => {
  try {
    const agent = await primsa.agent.findUnique({
      where: {
        id: agentId,
      },
      select: {
        id: true,
      },
    });
    const customer = await primsa.user.findUnique({
      where: {
        id: customerId,
        role: UserRoles.CUSTOMER,
      },
    });
    if (!agent || !customer) {
      return false;
    }

    const chat = await primsa.chat.create({
      data: {
        agentId: agent.id,
        customerId: customer.id,
        categoryId,
        departmentId,
      },
    });
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

// const getDepartmentFromCategory = async (categoryId: number) => {
//   try {
//     const category = await primsa.category.findUnique({
//       where: {
//         id: categoryId,
//       },
//       include: {
//         departments: true,
//       },
//     });
//     if (!category) {
//       throw ApiError.internal('Internal server error');
//     }
//     return category.department.name;
//   } catch (error) {
//     console.log(error);
//     ApiError.internal('Internal server error');
//   }
// };

export {
  getAgentDepartmentAndAgentId,
  createNewChat,
  // getDepartmentFromCategory,
};
