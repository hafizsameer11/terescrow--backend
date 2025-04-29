import { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  Chat,
  PrismaClient,
  UserRoles,
  User,
  ChatType,
  ChatStatus,
} from '@prisma/client';
import { getCustomerSocketId } from '../../socketConfig';
import { io } from '../../socketConfig';
import { sendPushNotification } from '../../utils/pushService';

const prisma = new PrismaClient();

export const sendToCustomerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message,
      chatId,
      _user: sender,
    } = req.body as { message: string; chatId: string; _user: User };
    console.log(req.body);

    // if (sender.role !== UserRoles.agent) {
    //   return next(ApiError.unauthorized('You are not authorized'));
    // }

    // if (!message.trim() || !chatId) {
    //   return next(ApiError.badRequest('Invalid request credentials'));
    // }
    const image = req.file?.filename || '';

    const chat = await prisma.chat.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: sender.id,
              },
            },
          },
          { id: +chatId },
          {
            chatType: ChatType.customer_to_agent,
          },
        ],
      },
      select: {
        id: true,
        participants: {
          where: {
            userId: {
              not: sender.id,

            },
          },
          select: {
            userId: true,
            user: true
          },
        },
      },
    });
    //update chat updatedAt to current one
    if (chat) {
      const updatedChat = await prisma.chat.update({
        where: {
          id: chat.id,
        },
        data: {
          updatedAt: new Date(),
        }
      });
    }
    const notification = await prisma.inAppNotification.create({
      data: {
        userId: chat?.participants[0].userId || sender.id,
        title: "New Message",
        description: `You have a new message from ${sender.firstname} ${sender.lastname} message :  ${message}`,
      }
    });
    const userActivity = await prisma.accountActivity.create({
      data: {
        userId: sender.id,
        description: `${sender.firstname} ${sender.lastname} sent a message to ${chat?.participants[0].user?.firstname} ${chat?.participants[0].user?.lastname}`,

      }
    })

    if (!chat) {
      return next(ApiError.notFound('this chat does not exist'));
    }

    const newMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId: chat.participants[0].userId,
        message: message || '',
        image: image || undefined,
      },
    });

    if (!newMessage) {
      return next(ApiError.internal('Message Sending Failed'));
    }


    const recieverSocketId = getCustomerSocketId(newMessage.receiverId!);
    if (recieverSocketId) {
      io.to(recieverSocketId).emit('message', {
        from: sender.id,
        message: newMessage,
      });
      console.log('sent to customer');
    }
const receiverNotification=sendPushNotification({
      userId: chat?.participants[0].userId || sender.id, // receiver
      title: 'New Message',
      body: `You have a new message from ${sender.firstname} ${sender.lastname} :  ${message}`,
      sound: 'default',});
    return new ApiResponse(201, newMessage, 'Message sent successfully').send(
      res
    );
  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const changeChatStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const agent: User = req.body._user;
    if (agent.role !== UserRoles.agent) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { chatId, setStatus } = req.body as {
      chatId: string;
      setStatus: ChatStatus;
    };

    if (!chatId || !setStatus || ChatStatus[setStatus] === undefined) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: Number(chatId),
      },
      select: {
        chatDetails: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!chat) {
      return next(ApiError.notFound('chat not found'));
    }

    if (chat.chatDetails?.status === setStatus) {
      return next(ApiError.badRequest('chat status already set'));
    }

    await prisma.chat.update({
      where: {
        id: Number(chatId),
      },
      data: {
        chatDetails: {
          update: {
            status: setStatus,
          },
        },
      },
    });
    return new ApiResponse(
      200,
      undefined,
      'Chat Status set to ' + ChatStatus[setStatus]
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export const getAllChatsWithCustomerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;

    // Determine the filter based on user role
    const filter =
      user.role === 'admin'
        ? { chatType: ChatType.customer_to_agent } // Fetch all chats for admin
        : {
          AND: [
            {
              participants: {
                some: {
                  userId: user.id,
                },
              },
            },
            { chatType: ChatType.customer_to_agent },
          ],
        };

    const chats = await prisma.chat.findMany({
      where: filter,
      select: {
        id: true,
        chatType: true,
        _count: {
          select: {
            messages: {
              where: {
                isRead: false,
                receiverId: user.id,
              },
            },
          },
        },
        chatDetails: {
          select: {
            status: true,
            department: true,
          },
        },
        participants: {
          select: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
                role: true, // Include role to identify customers
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
      },
      orderBy: {
        updatedAt: 'desc',
      }


    });

    if (!chats) {
      return next(ApiError.notFound('Chats not found'));
    }

    const resData = chats.map((chat) => {
      const recentMessage = chat.messages?.[0] || null;
      const recentMessageTimestamp = chat.messages?.[0]?.createdAt || null;
      const customer = chat.participants.find(
        (participant) => participant.user.role === 'customer' // Find customer by role
      )?.user || null;
      const chatStatus = chat.chatDetails?.status || null;
      const messagesCount = chat._count?.messages || 0;
      const department = chat.chatDetails?.department || null;

      // Construct full profile picture URL


      return {
        id: chat.id,
        customer,
        recentMessage,
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
        department,
      };
    });

    return new ApiResponse(200, resData, 'Chats found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occurred!'));
  }
};

export const getCustomerChatDetailsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { chatId } = req.params;
    const user: User = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: Number(chatId),
      },
      include: {
        participants: {
          select: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
                role: true, // Include role to determine the customer
              },
            },
          },
        },
        chatDetails: {
          include: {
            category: true,
            department: true,
          },
        },
        chatGroup: true,
        messages: true,
      },
    });

    if (!chat || chat.chatType !== ChatType.customer_to_agent) {
      return next(ApiError.notFound('Chat does not exist'));
    }

    // Update unread messages as read
    const updatedMessages = await prisma.message.updateMany({
      where: {
        AND: [
          {
            chatId: chat.id,
          },
          {
            receiverId: user.id,
          },
        ],
      },
      data: {
        isRead: true,
      },
    });

    if (updatedMessages) {
      console.log("Messages updated");
    }

    const {
      messages,
      participants,
      chatDetails,
      id,
      chatType,
      createdAt,
      updatedAt,
    } = chat;

    // Find the customer based on their role
    const customer = participants.find(
      (participant) => participant.user.role === 'customer'
    )?.user || null;

    // Construct the response data
    const resData = {
      id,
      customer,
      messages,
      chatDetails,
      chatType,
      createdAt,
      updatedAt,
    };

    return new ApiResponse(200, resData, 'Chat found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occurred!'));
  }
};


export const getDefaultAgentChatsController = async (
  req: Request,
  res: Response,
  next: NextFunction) => {
  try {
    const user = req.body._user;
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const defaultAgent = await prisma.agent.findFirst({
      where: {
        isDefault: true
      },
    })
    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: defaultAgent?.userId,
              },
            },
          },
          { chatType: ChatType.customer_to_agent, },
          {
            chatDetails: {
              status: ChatStatus.pending
            }
          }

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
                receiverId: user.id
              },

            },

          },
        },
        chatDetails: {
          select: {
            status: true,
            department: true
          }
        },
        participants: {
          where: {
            userId: {
              not: defaultAgent?.userId,
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
      },
      orderBy: {
        messages: {

          _count: 'desc',
        },
      },
    });
    const resData = chats.map((chat) => {
      const recentMessage = chat.messages?.[0] || null;
      const recentMessageTimestamp = chat.messages?.[0]?.createdAt || null;
      const customer = chat.participants?.[0]?.user || null;
      const chatStatus = chat.chatDetails?.status || null;
      const messagesCount = chat._count?.messages || 0;
      const department = chat.chatDetails?.department || null;
      // Construct full profile picture URL
      if (customer && customer.profilePicture) {
        customer.profilePicture = `${hostUrl}/uploads/${customer.profilePicture}`;
      }

      return {
        id: chat.id,
        customer,
        recentMessage,
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
        department
      };
    });

    if (!chats) {
      return next(ApiError.notFound('Chats not found'));
    }
    return new ApiResponse(200, resData, 'Chats found').send(res);

  } catch (error) {
    console.log(error);
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Server Error Occured!'));
  }
}

export const takeOverDefaultAgentChatController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { chatId } = req.params;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    // Find the default agent
    const defaultAgent = await prisma.agent.findFirst({
      where: {
        isDefault: true,
      },
    });

    if (!defaultAgent) {
      return next(ApiError.notFound('Default agent not found'));
    }

    // Find the chat involving the default agent
    const chat = await prisma.chat.findFirst({
      where: {
        id: parseInt(chatId),
        chatType: ChatType.customer_to_agent,
        participants: {
          some: {
            userId: defaultAgent.userId, // Ensure defaultAgent.userId is not undefined
          },
        },
      },
    });
    const accountActivites = await prisma.accountActivity.create({
      data: {
        userId: user.id,
        description: `${user.username} have taken over a chat from the default agent`,
      }
    })
    if (!chat) {
      return next(ApiError.notFound('Chat not found or does not involve the default agent'));
    }

    // Update the chat participants to replace the default agent with the current user
    const updatedChat = await prisma.chat.update({
      where: {
        id: parseInt(chatId),
      },
      data: {
        participants: {
          updateMany: {
            where: {
              userId: defaultAgent.userId,
            },
            data: {
              userId: user.id,
            },
          },
        },
      },
    });

    if (!updatedChat) {
      return next(ApiError.internal('Failed to update chat participants'));
    }

    // Respond with the updated chat details
    return res.status(200).json({
      message: 'Chat successfully taken over from the default agent',
      chat: updatedChat,
    });
  } catch (error) {
    console.error('Error in takeOverDefaultAgentChatController:', error);

    if (error instanceof ApiError) {
      return next(error);
    }

    return next(ApiError.internal('An unexpected error occurred!'));
  }
};
