import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import { Chat, PrismaClient, User } from '@prisma/client';
import { getSocketId, io } from '../socketConfig';
import ApiResponse from '../utils/ApiResponse';
import { ParsedUrlQuery } from 'querystring';

const Prisma = new PrismaClient();

interface MessageRequest {
  _user: User;
  receiverUsername: User['username'];
  message: string;
  subDepartmentId: number;
}

const sendMessageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message,
      receiverUsername,
      _user: sender,
      subDepartmentId,
    } = req.body as MessageRequest;

    if (!message || !receiverUsername || !subDepartmentId) {
      throw next(ApiError.badRequest('Invalid request credentials'));
    }
    let agent;
    let customer;
    let receiver;
    if (sender.role == 'AGENT') {
      agent = sender;
      customer = await Prisma.user.findUnique({
        where: {
          username: receiverUsername,
        },
      });
      if (!customer) {
        throw next(ApiError.badRequest('Customer not found'));
      }
      receiver = customer;
    } else {
      if (sender.role == 'CUSTOMER') {
        customer = sender;
        agent = await Prisma.user.findUnique({
          where: {
            username: receiverUsername,
          },
        });
        if (!agent) {
          throw next(ApiError.badRequest('Agent not found'));
        }
        receiver = agent;
      } else {
        throw next(ApiError.badRequest('User not found'));
      }
    }

    let chat = await Prisma.chat.findFirst({
      where: {
        AND: [
          {
            agentId: agent.id,
          },
          {
            customerId: customer.id,
          },
        ],
      },
    });

    if (!chat) {
      chat = await Prisma.chat.create({
        data: {
          agentId: agent.id,
          customerId: customer.id,
          subDepartmentId,
        },
      });
    }

    const newMessage = await Prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId: receiver.id,
        message,
      },
    });

    if (!newMessage) {
      throw next(ApiError.internal('Message Sending Failed'));
    }

    // if (!chat.messages.includes(newMessage._id)) {
    //   chat.messages.push(newMessage._id);
    //   await chat.save();
    // }

    // its to check whether the user is online or offline now
    //io.to is used to send message to a particular user

    const recieverSocketId = getSocketId(receiver.username);
    if (recieverSocketId) {
      io.to(recieverSocketId).emit('message', {
        from: sender.username,
        message,
      });
      console.log('emitted');
    }

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

const getChatController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { chatId } = req.params;
    const user: User = req.body._user;
    if (!chatId) {
      throw next(ApiError.badRequest('Chat not found'));
    }

    const chat = await Prisma.chat.findUnique({
      where: {
        id: parseInt(chatId),
      },
      include: {
        messages: {
          include: {
            sender: true,
            receiver: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!chat) {
      throw next(ApiError.badRequest('Chat not found'));
    }

    //Add a flag to check whether the user belongs to this chat or is admin
    const { senderId, receiverId } = chat.messages[0];

    if (
      user.role !== 'ADMIN' &&
      user.id !== senderId &&
      user.id !== receiverId
    ) {
      throw next(ApiError.badRequest('Invalid chat request'));
    }

    return new ApiResponse(200, chat, 'Chat found successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

const getAllChatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    let chats: Chat[];
    switch (user.role) {
      case 'ADMIN':
        chats = await Prisma.chat.findMany({
          where: {
            agentId: user.id,
          },
          include: {
            messages: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        });
        break;
      case 'AGENT':
        chats = await Prisma.chat.findMany({
          where: {
            agentId: user.id,
          },
          include: {
            messages: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        });
        break;
      case 'CUSTOMER':
        chats = await Prisma.chat.findMany({
          where: {
            customerId: user.id,
          },
          include: {
            messages: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        });
        break;
    }

    if (!chats) {
      throw next(ApiError.notFound('No chats were found'));
    }

    return new ApiResponse(200, chats, 'Chats fetched successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export { sendMessageController, getChatController, getAllChatsController };
