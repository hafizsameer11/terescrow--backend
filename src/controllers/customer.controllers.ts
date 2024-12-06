import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { Chat, PrismaClient, UserRoles, User } from '@prisma/client';
import { getAgentSocketId, getCustomerSocketId, io } from '../socketConfig';

const prisma = new PrismaClient();

const getDepartmentsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UserRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const departments = await prisma.department.findMany();
    if (!departments) {
      return next(ApiError.notFound('Departments not found'));
    }

    return new ApiResponse(200, departments, 'Departments found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

const getCategoriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UserRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { departmentId } = req.params;

    const categories = await prisma.catDepart.findMany({
      where: {
        departmentId: parseInt(departmentId),
      },
      select: {
        category: true,
      },
    });

    if (!categories) {
      return next(ApiError.notFound('Categories not found'));
    }
    const resData = {
      departmentId,
      categories,
    };
    return new ApiResponse(200, resData, 'Categories found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

const getSubCategoriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UserRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { departmentId, categoryId } = req.query;

    const subCategories = await prisma.catSubcat.findMany({
      where: {
        categoryId: parseInt(categoryId as string),
      },
      select: {
        subCategory: true,
      },
    });

    if (!subCategories) {
      return next(ApiError.notFound('SubCategories not found'));
    }
    const resData = {
      departmentId,
      categoryId,
      subCategories,
    };
    return new ApiResponse(200, resData, 'SubCategories found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
  }
};

const getCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (user.role !== UserRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const countries = await prisma.country.findMany();
    if (!countries) {
      return next(ApiError.notFound('Countries not found'));
    }

    return new ApiResponse(200, countries, 'Countries found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};

const sendMessageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message,
      receiverId,
      _user: sender,
      categoryId,
      departmentId,
    } = req.body as MessageRequest;

    if (sender.role !== 'CUSTOMER') {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    if (!message || !receiverId || !categoryId) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    let chat = await prisma.chat.findFirst({
      where: {
        AND: [
          {
            agentId: receiverId,
          },
          {
            customerId: sender.id,
          },
        ],
      },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          agentId: receiverId,
          customerId: sender.id,
          categoryId,
          departmentId,
        },
      });
    }

    const newMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId,
        message,
      },
    });

    if (!newMessage) {
      return next(ApiError.internal('Message Sending Failed'));
    }

    // if (!chat.messages.includes(newMessage._id)) {
    //   chat.messages.push(newMessage._id);
    //   await chat.save();
    // }

    // its to check whether the user is online or offline now
    //io.to is used to send message to a particular user

    const recieverSocketId = getAgentSocketId(receiverId);
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
    if (user.role !== UserRoles.CUSTOMER) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    if (!chatId) {
      return next(ApiError.badRequest('Chat not found'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: parseInt(chatId),
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!chat) {
      return next(ApiError.badRequest('Chat not found'));
    }

    //Add a flag to check whether the user belongs to this chat or is admin
    const { senderId, receiverId } = chat.messages[0];

    if (user.id !== senderId && user.id !== receiverId) {
      return next(ApiError.badRequest('Invalid chat request'));
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

    const chats = await prisma.chat.findMany({
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

    if (!chats) {
      return next(ApiError.notFound('No chats were found'));
    }

    return new ApiResponse(200, chats, 'Chats fetched successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

export {
  getDepartmentsController,
  getCategoriesController,
  getSubCategoriesController,
  getCountriesController,
  getChatController,
  getAllChatsController,
  sendMessageController,
};

interface MessageRequest {
  _user: User;
  receiverId: User['id'];
  message: string;
  categoryId: number;
  departmentId: number;
}
