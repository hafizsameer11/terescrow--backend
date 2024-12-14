import { ChatStatus, ChatType, PrismaClient, UserRoles } from '@prisma/client';

const primsa = new PrismaClient();

const getAgentDepartments = async (
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

    // console.log(
    //   isAgent?.agent?.assignedDepartments.forEach((dep) =>
    //     console.log('dep: ', dep.id)
    //   )
    // );
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
): Promise<string | null> => {
  try {
    if (!agentId || !customerId || !departmentId || !categoryId) {
      return null;
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
      return newChat.id.toString();
    }
    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const checkPendingChat = async (
  customerId: number,
  departmentId: number,
  categoryId: number
): Promise<string | null> => {
  try {
    const chat = await primsa.chat.findFirst({
      where: {
        AND: [
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
      return chat.id.toString();
    }
    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export {
  getAgentDepartments,
  createCustomerToAgentChat,
  checkPendingChat,
  // getDepartmentFromCategory,
};
