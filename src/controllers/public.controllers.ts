import {
  UserRoles,
  PrismaClient,
  User,
  UserOTP,
  DepartmentStatus,
} from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import ApiResponse from '../utils/ApiResponse';
import { comparePassword, generateToken } from '../utils/authUtils';
import { validationResult } from 'express-validator';
import { profile } from 'console';

const prisma = new PrismaClient();

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log(req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest(
        'Please enter valid credentials',
        errors.array()
      );
    }

    const { email, password }: { email: string; password: string } = req.body;
    console.log(email);
    if (!email || !password) {
      return next(ApiError.badRequest('Please enter valid credentials'));
    }
    const isUser = await prisma.user.findUnique({
      where: { email },
      include: {
        KycStateTwo: {
          orderBy: {
            createdAt: 'desc'
          }
        },
      },
    });
    if (!isUser) {
      return next(ApiError.badRequest('This email is not registerd'));
    }
    // if(isUser.isVerified===false){
    //   return next(ApiError.badRequest('Your account is not verified. Please chceck your email'))
    // }
    const isMatch = await comparePassword(password, isUser.password);
    if (!isMatch) {
      return next(ApiError.badRequest('Your password is not correct'));
    }
    const token = generateToken(isUser.id, isUser.username, isUser.role);
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    const getNotificationCount = await prisma.inAppNotification.findMany({
      where: {
        userId: isUser.id,
        isRead: false,
      }
    });
    const resData = {
      id: isUser.id,
      firstname: isUser.firstname,
      lastname: isUser.lastname,

      username: isUser.username,
      profilePicture: isUser.profilePicture,
      email: isUser.email,
      role: isUser.role,
      phoneNumber: isUser.phoneNumber,
      country: isUser.country,
      gender: isUser.gender,
      isVerified: isUser.isVerified,
      KycStateTwo: isUser.KycStateTwo[0],
      unReadNotification: getNotificationCount.length
    };
    const accountActivity = await prisma.accountActivity.create({
      data: {
        userId: isUser.id,
        description: `User logged in successfully`,
      },
    })

    return new ApiResponse(
      200,
      resData,
      'User logged in successfully',
      token
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

export const getAllDepartmentsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const departments = await prisma.department.findMany({
      where: {
        status: DepartmentStatus.active
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
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

export const getCategoriesFromDepartment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { departmentId } = req.params;

    const categories = await prisma.catDepart.findMany({
      where: {
        departmentId: parseInt(departmentId),
        category: {
          status: DepartmentStatus.active
        }
      },
      select: {
        category: true,
      },
    });

    if (!categories || categories.length === 0) {
      return next(ApiError.notFound('Categories not found'));
    }

    // Update image URL
    const modifiedCategories = categories.map((cat) => ({
      category: {
        ...cat.category,
        image: cat.category.image
          ? `https://${req.get('host')}/uploads/${cat.category.image}`
          : null, // Handle cases where image is null
      },
    }));



    const resData = {
      departmentId,
      categories: modifiedCategories,
    };


    return new ApiResponse(200, resData, 'Categories found').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};


export const getSubCategoriesFromCatDepart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log(req.query);
    const user: User = req.body._user;
    if (!user) {
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

export const getCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const countries = await prisma.country.findMany({
      select: {
        id: true,
        title: true,
      },
    });
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

export const readAllMessagesControllers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { _user, chatId }: { _user: User; chatId: number | string } = req.body;

    // Check if _user and chatId exist
    if (!_user || !chatId) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    // Ensure chatId is a number
    const parsedChatId = typeof chatId === 'number' ? chatId : parseInt(chatId, 10);

    if (isNaN(parsedChatId)) {
      return next(ApiError.badRequest('Invalid chatId'));
    }

    // Update messages
    const messages = await prisma.message.updateMany({
      where: {
        chatId: parsedChatId,
      },
      data: {
        isRead: true,
      },
    });

    // Check if messages were updated
    if (!messages) {
      return next(ApiError.notFound('No messages were found'));
    }

    return new ApiResponse(201, undefined, 'Messages read successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
};


export const getUnreadMessagesCountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    // const chatId = req.body.chatId; not chatId 
    const messagesCount = await prisma.message.count({
      where: {
        receiverId: user.id,
        isRead: false
      }
    })
    return new ApiResponse(200, messagesCount, 'Messages count').send(res);

  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
  }
}
export const saveFcmTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user as User;

    if (!user || !user.id) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== 'string') {
      return next(ApiError.badRequest('Please provide a valid FCM token'));
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { fcmToken },
    });

    return new ApiResponse(200, updatedUser, 'FCM token saved successfully').send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    console.error('💥 Error in saveFcmTokenController:', error.message);
    return next(ApiError.internal('Failed to save FCM token'));
  }
};

// export const readAllMessagesControllers = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { _user, chatId }: { _user: User; chatId: number } = req.body;

//     if (!_user || !chatId) {
//       return next(ApiError.unauthorized('You are not authorized'));
//     }

//     const messages = await prisma.message.updateMany({
//       where: {
//         chatId,
//       },
//       data: {
//         isRead: true,
//       },
//     });

//     if (!messages) {
//       return next(ApiError.notFound('No messages were found'));
//     }

//     return new ApiResponse(201, undefined, 'Messages read successfully').send(
//       res
//     );
//   } catch (error) {
//     if (error instanceof ApiError) {
//       return next(error);
//     }
//     next(error);
//   }
// };

// export const readAllMessagesControllers = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { _user, chatId }: { _user: User; chatId: number } = req.body;

//     if (!_user || !chatId) {
//       return next(ApiError.unauthorized('You are not authorized'));
//     }

//     const messages = await prisma.message.updateMany({
//       where: {
//         chatId,
//       },
//       data: {
//         isRead: true,
//       },
//     });

//     if (!messages) {
//       return next(ApiError.notFound('No messages were found'));
//     }

//     return new ApiResponse(201, undefined, 'Messages read successfully').send(
//       res
//     );
//   } catch (error) {
//     if (error instanceof ApiError) {
//       return next(error);
//     }
//     next(error);
//   }
// };


export const getNotificationController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const notifications = await prisma.inAppNotification.findMany({
      where: {
        userId: user.id,
        isRead: false
      },
      orderBy: { id: 'desc' }
    });
    if (!notifications) {
      return next(ApiError.notFound('No notifications were found'));
    }
    return new ApiResponse(200, notifications, 'Notifications found').send(res);

  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
    // next(error);
  }
}

export const markAllReadController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const notifications = await prisma.inAppNotification.updateMany({
      where: { userId: user.id },
      data: { isRead: true }
    });
    if (!notifications) {
      return next(ApiError.notFound('No notifications were found'));
    }
    return new ApiResponse(200, notifications, 'Notifications found').send(res);

  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
    // next(error);
  }
}
export const markAllMessageReadController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;
    if (!user) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    const messages = await prisma.message.updateMany({
      where: {
        receiverId: user.id
      },
      data: {
        isRead: true
      }
    });

    return new ApiResponse(200, messages, 'Messages found').send(res);

  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(error);
    // next(error);
  }
}


// export const getBanners