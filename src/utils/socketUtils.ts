import { ChatStatus, ChatType, PrismaClient, UserRoles } from '@prisma/client';
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

const createCustomerToAgentChat = async (
  agentId: number,
  customerId: number,
  departmentId: number,
  categoryId: number
) => {
  try {
    if (!agentId || !customerId || !departmentId || !categoryId) {
      return false;
    }

    const newChat = await primsa.chat.create({
      data: {
        chatType: ChatType.customer_to_agent,
        participants: {
          createMany: {
            data: [{ userId: agentId }, { userId: customerId }],
          },
        },
        chatDetails: {
          create: {
            departmentId,
            categoryId,
            status: ChatStatus.pending,
          },
        },
      },
    });
    if (newChat) {
      return true;
    }
    return false;
  } catch (error) {
    console.log(error);
    return false;
  }
};

const checkPendingChat = async (
  agentId: number,
  customerId: number,
  departmentId: number,
  categoryId: number
) => {
  try {
    const chat = await primsa.chat.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: agentId } } },
          { participants: { some: { userId: customerId } } },
          {
            chatDetails: {
              AND: [
                { departmentId: departmentId },
                { categoryId: categoryId },
                { status: ChatStatus.pending },
              ],
            },
          },
        ],
      },
    });
    if (chat) {
      return true;
    }
    return false;
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
  createCustomerToAgentChat,
  checkPendingChat,
  // getDepartmentFromCategory,
};
