import {
  ChatStatus,
  ChatType,
  Prisma,
  PrismaClient,
  UserRoles,
} from '@prisma/client';

const primsa = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;

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


/** Active trade chat — do not open another for same dept/category. */
const ACTIVE_CHAT_STATUSES: ChatStatus[] = [
  ChatStatus.pending,
  ChatStatus.processing,
];

async function findActiveCustomerChat(
  customerId: number,
  departmentId: number,
  categoryId: number,
  db: DbClient = primsa
) {
  return db.chat.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: customerId } } },
        {
          chatDetails: {
            AND: [
              { departmentId },
              { categoryId },
              { status: { in: ACTIVE_CHAT_STATUSES } },
            ],
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

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

    // Re-check inside a transaction so double requestAssignment (blank twin
    // chats) returns the existing active chat instead of creating another.
    const chatId = await primsa.$transaction(async (tx) => {
      const existing = await findActiveCustomerChat(
        customerId,
        departmentId,
        categoryId,
        tx
      );
      if (existing) {
        console.log(
          `[createChat] reuse active chat=${existing.id} customer=${customerId} dept=${departmentId} cat=${categoryId}`
        );
        return existing.id.toString();
      }

      const newChat = await tx.chat.create({
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
      return newChat.id.toString();
    });

    return chatId;
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
    // Treat pending + processing as "already open" so customers cannot spawn
    // a second sell chat while the first is still being worked.
    const chat = await findActiveCustomerChat(
      customerId,
      departmentId,
      categoryId
    );
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
