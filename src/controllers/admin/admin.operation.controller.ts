import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import { Gender, PrismaClient, User, UserRoles } from '@prisma/client';
import { DepartmentStatus, AssignedDepartment } from '@prisma/client';
import { hashPassword } from '../../utils/authUtils';
import { UserRequest } from '../customer/auth.controllers';
import { validationResult } from 'express-validator';
import upload from '../../middlewares/multer.middleware';
import { sendPushNotification } from '../../utils/pushService';

const prisma = new PrismaClient();


/*
Customer Controller

*/
export const getCustomerDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;
        if (!user || user.role == UserRoles.customer) {
            return next(ApiError.unauthorized('You are not authorized'));
        }

        const userId = req.params.id;
        const customer = await prisma.user.findUnique({
            where: {
                id: parseInt(userId),
            },
            include: {
                KycStateTwo: {
                    take: 1, // Limit to the first record
                    orderBy: {
                        createdAt: 'desc', // Sort by `createdAt` in descending order
                    },
                },
                AccountActivity: {
                    take: 6, // Fetch the latest 6 activities
                    orderBy: {
                        createdAt: 'desc', // Sort by `createdAt` in descending order
                    },
                },
            },
        });

        if (!customer) {
            return next(ApiError.notFound('Customer not found'));
        }

        // Extract the first KycStateTwo object or return null if none exist
        const kycStateTwo = customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null;

        // Return the response with the single KycStateTwo object
        return new ApiResponse(
            200,
            {
                ...customer,
                KycStateTwo: kycStateTwo, // Replace array with the single object
            },
            'Customer details fetched successfully'
        ).send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to fetch customer details'));
    }
};

export const getAllCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;

        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }

        const customers = await prisma.user.findMany({
            where: {
                role: UserRoles.customer,
            },
            include: {
                inappNotification: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 6
                },
                KycStateTwo: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!customers || customers.length === 0) {
            return next(ApiError.notFound('Customers not found'));
        }

        // Modify the response to remove the array from KycStateTwo
        const modifiedCustomers = customers.map(customer => ({
            ...customer,
            KycStateTwo: customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null
        }));

        return new ApiResponse(200, modifiedCustomers, 'Customers fetched successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to fetch customers'));
    }
};

export const editCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        const userId = req.params.id;
        //get profile pictire
        const profilePicture = req.file ? req.file.filename : '';
        if (!user || (user.role === UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const {
            username,
            email,

            phoneNumber,
            gender,
            firstname,
            lastname,
            country,

        } = req.body;
        // const hashedPassword = await hashPassword(password)
        const customer = await prisma.user.update({
            where: {
                id: parseInt(userId)
            },
            data: {
                username: username,
                email: email,
                phoneNumber: phoneNumber,
                gender: gender,
                country: country,
                firstname: firstname,
                lastname: lastname,
                profilePicture: profilePicture
            }

        });
        if (!customer) {
            return next(ApiError.notFound('Customer not found'));
        }
        const accountActivity = await prisma.accountActivity.create({
            data: {
                userId: parseInt(userId),
                description: 'Profile updated'
            }
        })
        return new ApiResponse(200, customer, 'Customer updated successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to change department status'));
    }
}
// export const getTransactionForCustomer = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const user = req.body._user
//         // return new ApiResponse(201, user, 'Transaction created successfully').send(res);
//         if (!user || (user.role == UserRoles.customer.admin)) {
//             return next(ApiError.unauthorized('You are not authorized'));
//         }

//         const customerId = req.params.id;
//         const transactions = await prisma.transaction.findMany({
//             where: {
//                 customerId: parseInt(customerId)
//             },
//             include: {
//                 department: true,
//                 category: true,
//                 agent: {
//                     select: {
//                         user: {
//                             select: {
//                                 id: true,
//                                 username: true
//                             }
//                         }
//                     }
//                 },
//                 customer: {
//                     select: {
//                         id: true,
//                         username: true,
//                     },
//                 },
//             }
//         })
//         if (!transactions) {
//             return next(ApiError.notFound('Transactions not found'));
//         }
//         return new ApiResponse(200, transactions, 'Transactions fetched successfully').send(res);
//     } catch (error) {
//         console.log(error);
//         if (error instanceof ApiError) {
//             return next(error);
//         }
//         next(ApiError.internal('Failed to get transactions'));

//     }
// }


/*Rate Controller
 */
export const createRate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        console.log(user);
        if (!user || (user.role === UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const userId = user.id;
        const agent = await prisma.agent.findUnique({
            where: {
                userId: userId
            },
            select: {
                id: true
            }
        });
        const agentId = agent?.id ?? userId;
        const { amount, rate, amountNaira, chatId } = req.body;
        const rateRecord = await prisma.rate.create(
            {
                data: {
                    amount: amount,
                    agentId: agentId,
                    rate: rate,
                    amountNaira: amountNaira,
                    chatId: parseInt(chatId)
                }
            }
        )
        if (!rateRecord) {
            return next(ApiError.badRequest('Failed to create rate'))

        }
        return new ApiResponse(201, rateRecord, 'Rate created successfully').send(res);


    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get rate for customer'));
    }
}
export const getRates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const rates = await prisma.transaction.findMany({
            select: {
                amount: true,
                id: true,
                amountNaira: true,
                exchangeRate: true,
                createdAt: true,
                chat: {
                    select: {
                        participants: {
                            where: {
                                user: {
                                    role: UserRoles.agent
                                }
                            },
                            include: {
                                user: true
                            }
                        }
                    }
                }

            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        if (!rates) {
            return next(ApiError.notFound('Rates not found'));
        }
        const adjustedRates = rates.map((rate) => {
            return {
                id: rate.id,
                amount: rate.amount,
                agent: rate.chat.participants[0].user.username,
                rate: rate.exchangeRate,
                amountNaira: rate.amountNaira,
                // chatId: rate.chatId,
                createdAt: rate.createdAt
            }

        })
        return new ApiResponse(200, adjustedRates, 'Rates fetched successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get rates for customer'));
    }
}

/*AGent And Cusomter*/

export const getAgents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const agents = await prisma.agent.findMany({
            select: {
                id: true,
                AgentStatus: true,
                user: {
                    select: {
                        id: true,
                        username: true,
                        firstname: true,
                        lastname: true,
                        profilePicture: true,
                        email: true,
                        role: true,
                        createdAt: true
                    },
                },
            }
        })
        if (!agents) {
            return next(ApiError.notFound('Agents not found'));
        }
        return new ApiResponse(200, agents, 'Agents fetched successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get agents for customer'));
    }
}
export const getTeamMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const agents = await prisma.user.findMany({
            where: {
                NOT: {
                    role: UserRoles.customer || UserRoles.admin,


                }
            },
            include: {
                customRole: true,
                agent: true,

            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        if (!agents) {
            return next(ApiError.notFound('Agents not found'));
        }
        return new ApiResponse(200, agents, 'Agents fetched successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get agents for customer'));
    }
}
export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const users = await prisma.user.findMany({
            where: {
                NOT: {
                    role: UserRoles.admin
                }
            },
            include: {
                agent: {
                    select: {
                        id: true,
                        AgentStatus: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        if (!users) {
            return next(ApiError.notFound('Users not found'));
        }
        return new ApiResponse(200, users, 'Users fetched successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get all users'));
    }
}

/*

Banner Controller

*/

export const createBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const image = req.file?.filename || '';

        const banner = await prisma.banner.create({
            data: {
                image
            }
        })
        if (!banner) {
            return next(ApiError.badRequest('Failed to create banner'))
        }
        return new ApiResponse(201, banner, 'Banner created successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to create banner'));
    }
}
export const getBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const banners = await prisma.banner.findMany()
        //we will get image add the server url in start

        if (!banners) {
            return next(ApiError.notFound('Banners not found'));
        }
        // const modifiedBanner = banners.map((banner) => {
        //     return { ...banner, image: `${process.env.SERVER_URL}/uploads/${banner.image}` }
        // })
        return new ApiResponse(200, banners, 'Banners fetched successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get banners'));
    }
}
export const updateBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const image = req.file?.filename || '';
        const banner = await prisma.banner.update({
            where: {
                id: parseInt(req.params.id)
            },
            data: {
                image
            }
        })
        if (!banner) {
            return next(ApiError.badRequest('Failed to update banner'))
        }
        return new ApiResponse(201, banner, 'Banner updated successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to update banner'));
    }
}
export const getsingleBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const banner = await prisma.banner.findUnique({
            where: {
                id: parseInt(req.params.id)
            }
        })
        if (!banner) {
            return next(ApiError.notFound('Banner not found'));
        }
        return new ApiResponse(200, banner, 'Banner fetched successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get banner'));
    }
}
export const deleteBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const banner = await prisma.banner.delete({
            where: {
                id: parseInt(req.params.id)
            }
        })
        if (!banner) {
            return next(ApiError.notFound('Banner not found'));
        }
        return new ApiResponse(200, banner, 'Banner deleted successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to delete banner'));
    }
}

/*

Notification Crud

*/

export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.body._user;

    if (!user || user.role === UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const { message, title, type } = req.body;

    // Parse userIds if sent as JSON string
    let userIds = req.body.userIds;
    if (userIds !== undefined && typeof userIds === 'string') {
      try {
        userIds = JSON.parse(userIds);
      } catch (error) {
        console.error('Invalid userIds JSON:', error);
        return next(ApiError.badRequest('Invalid userIds format'));
      }
    }

    // If userIds not provided, fetch all customers
    if (!Array.isArray(userIds)) {
      const allUsers = await prisma.user.findMany({
        where: {
          role: UserRoles.customer, // adjust if you want agents or all users
        },
        select: {
          id: true,
        },
      });
      userIds = allUsers.map(user => user.id);
    }

    const image = req.file?.filename || '';

    // Create main notification record
    const notification = await prisma.notification.create({
      data: {
        isSingle: false,
        message,
        type,
        title,
        image,
      },
    });

    if (!notification) {
      return next(ApiError.badRequest('Failed to create notification'));
    }

    // Send to each user
    const notificationPromises = userIds.map(async (userId: number) => {
      // Create in-app notification
      await prisma.inAppNotification.create({
        data: {
          userId,
          title,
          description: message,
          type: 'customeer', // fix typo from 'customeer'
        },
      });

      // Send push notification
      await sendPushNotification({
        userId: userId,
        title: title,
        body: message,
        sound: 'default',
      });
    });

    await Promise.all(notificationPromises);

    return new ApiResponse(201, notification, 'Notification created successfully').send(res);
  } catch (error) {
    console.error('Notification Error:', error);
    return next(
      error instanceof ApiError ? error : ApiError.internal('Failed to create notification')
    );
  }
};


export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const notifications = await prisma.notification.findMany()
        if (!notifications) {
            return next(ApiError.notFound('Notifications not found'));
        }
        return new ApiResponse(200, notifications, 'Notifications fetched successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get notifications'));
    }
}
export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const notification = await prisma.notification.delete({
            where: {
                id: parseInt(req.params.id)
            }
        })
        if (!notification) {
            return next(ApiError.notFound('Notification not found'));
        }
        return new ApiResponse(200, notification, 'Notification deleted successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to delete notification'));
    }
}
export const updateNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const image = req.file?.filename || '';
        const oldnotification = await prisma.notification.findUnique({
            where: {
                id: parseInt(req.params.id)
            }
        })

        const notification = await prisma.notification.update({
            where: {
                id: parseInt(req.params.id)
            },
            data: {
                message: req.body.message,
                type: req.body.type,
                title: req.body.title,
                image: image || oldnotification?.image
            }
        })
        if (!notification) {
            return next(ApiError.badRequest('Failed to update notification'))
        }
        return new ApiResponse(201, notification, 'Notification updated successfully').send(res);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to update notification'));
    }
}
export const getAdminDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const users = await prisma.user.count()
        const agents = await prisma.user.count({
            where: {
                role: UserRoles.agent
            }
        })
        const transactions = await prisma.transaction.count()
        const categories = await prisma.category.count()
        const departments = await prisma.department.count()
        //get tranactionAmountSum
        const transactionAmountSum = await prisma.transaction.aggregate({
            _sum: {
                amount: true
            }
        })
        return new ApiResponse(200, { users, agents, transactions, categories, departments, transactionAmountSum }, 'Dashboard stats fetched successfully').send(res);

    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get admin dashboard stats'));
    }
}
export const getCustomerStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user
        if (!user || (user.role == UserRoles.customer)) {
            return next(ApiError.unauthorized('You are not authorized'));
        }
        const users = await prisma.user.count({
            where: {
                role: UserRoles.customer
            }
        })
        const verifiedUser = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                KycStateTwo: {
                    some: {}, // Ensures that at least one related KycStateTwo record exists

                }
            }
        })
        return new ApiResponse(200, { users, verifiedUser }, 'Customer stats fetched successfully').send(res);
    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get customer stats'));
    }

}
export const getDepartmentStatsByTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = req.body._user;
        if (!user || user.role == UserRoles.customer) {
            return next(ApiError.unauthorized('You are not authorized'));
        }

        const transactions = await prisma.transaction.groupBy({
            by: ['departmentId'],
            _sum: {
                amount: true,
            },
            _count: {
                departmentId: true,
            },
        });

        // Fetch department names for the department IDs
        const departmentIds = transactions
            .map((t) => t.departmentId)
            .filter((id): id is number => id !== null); // Filter out null values
        const departments = await prisma.department.findMany({
            where: { id: { in: departmentIds } },
            select: { id: true, title: true },
        });

        // Map department names to transactions
        const result = transactions.map((transaction) => {
            const department = departments.find((d) => d.id === transaction.departmentId);
            return {
                departmentName: department?.title || 'Unknown',
                amount: transaction._sum.amount || 0,
            };
        });

        return new ApiResponse(
            200,
            result,
            'Department stats by transaction fetched successfully'
        ).send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get department stats by transaction'));
    }
};
export const updateKycStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const { kycStatus } = req.body;
        const { reason } = req.body;
        const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
        if (!user) {
            return next(ApiError.notFound('User not found'));
        }
        const updateKycStates = await prisma.kycStateTwo.updateMany({
            where: {
                userId: parseInt(userId)
            }, data: {
                state: kycStatus,
                reason: reason || "Your Information has been verified successfully"
            }
        })
        if (!updateKycStates) {
            return next(ApiError.badRequest('Failed to update kyc status'))
        }
        return new ApiResponse(200, updateKycStates, 'Kyc status updated successfully').send(res);

    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to update kyc status'));
    }
}

export const getNotificationForUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const userId = req.params.userId;
        const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
        if (!user) {
            return next(ApiError.notFound('User not found'));
        }
        const notifications = await prisma.inAppNotification.findMany({
            where: {
                userId: parseInt(userId)
            },
            take: 8,
            orderBy: {
                createdAt: 'desc'
            }
        });
        return new ApiResponse(200, notifications, 'Notification fetched successfully').send(res);

    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to get notification for users'));
    }
}

export const changeUserStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const { status } = req.body;
        console.log(req.body);
        const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
        if (!user) {
            return next(ApiError.notFound('User not found'));
        }
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(userId) },
            data: {
                status: status
            }
        });
        if (!updatedUser) {
            return next(ApiError.badRequest('Failed to update user status'));
        }
        return new ApiResponse(200, updatedUser, 'User status updated successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to change user status'));
    }
}

export const createWayOfHearing = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const { means } = req.body;
        const wayOfHearingData = await prisma.waysOfHearing.create({
            data: {
                means: means || ''
            }
        })
        if (!wayOfHearingData) {
            return next(ApiError.badRequest('Failed to create way of hearing'))
        }
        return new ApiResponse(201, wayOfHearingData, 'Way of hearing created successfully').send(res);

    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to create way of hearing'));
    }
}

export const getWaysOfHearing = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const waysOfHearing = await prisma.waysOfHearing.findMany();

        if (!waysOfHearing || waysOfHearing.length === 0) {
            return next(ApiError.notFound('Ways of hearing not found'));
        }

        const waysOfHearingWithCounts = await prisma.user.groupBy({
            by: ['meansId'],
            _count: { meansId: true }
        });
        const waysOfHearingSImple = waysOfHearing.map(way => {
            return {
                id: way.id,
                title: way.means
            }
        })

        const groupedWaysOfHearing = waysOfHearing.map(way => {
            const countEntry = waysOfHearingWithCounts.find(item => item.meansId === way.id);
            return {
                name: way.means,
                count: countEntry ? countEntry._count.meansId : 0
            };
        });

        return new ApiResponse(200, { list: waysOfHearingSImple, grouped: groupedWaysOfHearing }, 'Ways of hearing fetched successfully').send(res);

    } catch (error) {
        console.error(error);
        return next(ApiError.internal('Failed to get ways of hearing'));
    }
};
export const updateWayOfHearing = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const wayId = req.params.id;
        const { means } = req.body;

        const wayOfHearingData = await prisma.waysOfHearing.update({
            where: {
                id: parseInt(wayId)
            },
            data: {
                means: means || ''
            }
        })
        if (!wayOfHearingData) {
            return next(ApiError.badRequest('Failed to update way of hearing'))
        }
        return new ApiResponse(200, wayOfHearingData, 'Way of hearing updated successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Failed to update way of hearing'));
    }
}