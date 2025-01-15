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
              select: { departmentId: true },
            },
          },
        },
      },
    });

    if (!isAgent || !isAgent.agent) return null;

    const transformedDepartments = isAgent.agent.assignedDepartments.map((dept) => ({
      id: dept.departmentId, // Alias transformation
    }));

    return {
      agentId: isAgent.agent.id,
      assignedDepartments: transformedDepartments,
    };
  } catch (error) {
    console.error('Error fetching agent departments:', error);
    return null;
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
const getDefaultAgent = async () => {
  try {
    const agent = await primsa.user.findFirst({
      where: {
        role: UserRoles.agent,
        agent: {
          isDefault: true
        }
      }
    });
    if (agent) {
      return agent;
    }
    return null;
  }
  catch (error) {
    console.log(error);
    return null;
  }
}
export const sendDefaultMessageFromDefaultAgent = async (chatId: Number, agentId: Number) => {
  try {
    console.log("send default message hit",chatId,agentId);
    const chat = await primsa.chat.findFirst({
      where: {
        id: parseInt(chatId.toString()),
       
      },
      include: {
        participants: {
          where: {
            NOT: {
              userId: parseInt(agentId.toString())
            }
          }
        }
      }
    });
    if (chat) {
      const message = await primsa.message.create({
        data: {
          message: "All our agents are currently busy. Please wait for a moment.",
          chatId: parseInt(chatId.toString()),
          senderId: parseInt(agentId.toString()),
          receiverId: chat.participants[0].userId
        }
      });
      console.log(message);
      return message;
    }
    console.log("chat not found");
    return null;

  } catch (error) {
    console.log(error);
  }
}
export {
  getAgentDepartments,
  createCustomerToAgentChat,
  checkPendingChat,
  getDefaultAgent
  // getDepartmentFromCategory,
};
