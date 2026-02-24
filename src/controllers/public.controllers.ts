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
import axios from 'axios';
import { sendToUserById } from '../utils/notificationController';
import { sendPushNotification } from '../utils/pushService';
// import { sendPushNotification } from '../utils/firebaseNotificationService';

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
    
    // Check if user has verified their OTP/email
    if (isUser.isVerified === false) {
      return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
    }
    
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
    const notification = await sendPushNotification({
      userId: isUser.id,
      title: 'Welcome',
      body: 'Welcome to our platform!',
      sound: 'default',
    });
    
    // const notification = notifyUserById(isUser.id, 'Welcome', 'Welcome to our platform!');
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

/**
 * Public utility endpoint to manually refresh wallet currency USD prices
 * from CoinMarketCap and persist to wallet_currencies.price.
 *
 * NOTE:
 * - CoinMarketCap key is hardcoded for now (as requested)
 * - Intended as manual trigger for now (queue/job can be added later)
 */
export const updateWalletCurrencyPricesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = 'cedec018-8d93-4a8f-b42e-29252a40c621';

    const apiSymbols = ['BTC', 'ETH', 'BNB', 'TRX', 'LTC'];
    const symbolMap: Record<string, string> = {
      BTC: 'btc',
      ETH: 'eth',
      BNB: 'bsc',
      TRX: 'tron',
      LTC: 'ltc',
    };

    const response = await axios.get(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
      {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          Accept: 'application/json',
        },
        params: {
          symbol: apiSymbols.join(','),
          convert: 'USD',
        },
      }
    );

    const data = response?.data?.data || {};
    const updates: Array<{ symbol: string; dbCurrency: string; price: number; updatedRows: number }> = [];
    const skipped: Array<{ symbol: string; dbCurrency: string; reason: string }> = [];

    for (const [apiSymbol, dbCurrency] of Object.entries(symbolMap)) {
      const rawPrice = data?.[apiSymbol]?.quote?.USD?.price;
      if (rawPrice === undefined || rawPrice === null) {
        skipped.push({ symbol: apiSymbol, dbCurrency, reason: 'Price missing in CoinMarketCap response' });
        continue;
      }

      const price = Number(Number(rawPrice).toFixed(6));

      const result = await prisma.walletCurrency.updateMany({
        where: {
          OR: [{ currency: dbCurrency }, { currency: dbCurrency.toUpperCase() }],
        },
        data: { price },
      });

      updates.push({
        symbol: apiSymbol,
        dbCurrency,
        price,
        updatedRows: result.count,
      });

      if (result.count === 0) {
        skipped.push({ symbol: apiSymbol, dbCurrency, reason: 'No wallet_currencies rows matched currency' });
      }
    }

    return new ApiResponse(
      200,
      {
        totalSymbols: apiSymbols.length,
        updated: updates,
        skipped,
      },
      'Wallet currency prices updated successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error updating wallet currency prices:', error?.response?.data || error?.message || error);
    return next(ApiError.internal('Failed to update wallet currency prices'));
  }
};


// export const getBanners