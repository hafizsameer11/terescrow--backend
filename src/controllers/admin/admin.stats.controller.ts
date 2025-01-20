import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
const prisma = new PrismaClient();
export const getChatStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;

        // Conditions for filtering based on the user's role
        const userFilter = user.role !== UserRoles.admin ? {
            participants: { some: { userId: user.id } }
        } : {};

        // Count total chats
        const totalChats = await prisma.chat.count({
            where: {
                chatType: ChatType.customer_to_agent,
                ...userFilter, // Apply user filter if not admin
            },
        });

        // Count successful transactions
        const successfulTransactions = await prisma.transaction.count({
            where: {
                status: TransactionStatus.successful,
                chat: {
                    ...userFilter, // Apply user filter if not admin
                },
            },
        });

        // Count pending chats
        const pendingChats = await prisma.chat.count({
            where: {
                chatDetails: {
                    status: ChatStatus.pending,
                },
                ...userFilter, // Apply user filter if not admin
            },
        });

        // Count declined chats
        const declinedChats = await prisma.chat.count({
            where: {
                chatDetails: {
                    status: ChatStatus.declined,
                },
                ...userFilter, // Apply user filter if not admin
            },
        });
        const unsuccessfulChats = await prisma.chat.count({
            where: {
                chatDetails: {
                    status: ChatStatus.unsucessful,
                },
                ...userFilter, // Apply user filter if not admin
            },
        });

        // Combine results into a single object
        const data = {
            totalChats,
            successfulTransactions,
            pendingChats,
            declinedChats,
            unsuccessfulChats
        };

        return new ApiResponse(200, data, 'Stats found successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        return next(ApiError.internal('Internal Server Error'));
    }
};



export const getDashBoardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get the current and previous month dates
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        // Fetch current month data
        const totalUsers = await prisma.user.count();
        const totalInflow = await prisma.transaction.aggregate({
            _sum: {
                profit: true,
                amountNaira: true
            }
        });
        const totalOutflow = await prisma.transaction.aggregate({
            where: {
                department: {
                    Type: 'sell'
                }
            },
            _sum: {
                amount: true,
                amountNaira: true
            }
        });
        const totalRevenue = await prisma.transaction.aggregate({
            _sum: {
                amount: true,
                amountNaira: true
            }
        });
        const totalTransactions = await prisma.transaction.count();
        const totalAgents = await prisma.user.count({
            where: {
                role: 'agent'
            }
        });
        const verifiedCustomers = await prisma.user.count({
            where: {
                KycStateTwo: {
                    some: {}
                }
            }
        });
        const totalDepartments = await prisma.department.count();

        // Fetch previous month data for comparison
        const prevTotalUsers = await prisma.user.count({
            where: {
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const prevTotalInflow = await prisma.transaction.aggregate({
            where: {
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            },
            _sum: {
                profit: true,
                amountNaira: true
            }
        });
        const prevTotalOutflow = await prisma.transaction.aggregate({
            where: {
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                },
                department: {
                    Type: 'sell'
                }
            },
            _sum: {
                amount: true,
                amountNaira: true
            }
        });
        const prevTotalRevenue = await prisma.transaction.aggregate({
            where: {
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            },
            _sum: {
                amount: true,
                amountNaira: true
            }
        });
        const prevTotalTransactions = await prisma.transaction.count({
            where: {
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const prevTotalAgents = await prisma.user.count({
            where: {
                role: 'agent',
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const prevVerifiedCustomers = await prisma.user.count({
            where: {
                KycStateTwo: {
                    some: {}
                },
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });

        // Function to calculate percentage change
        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return { change: 'positive', percentage: 100 };
            const difference = current - previous;
            const percentage = (difference / previous) * 100;
            return {
                change: difference >= 0 ? 'positive' : 'negative',
                percentage: parseFloat(Math.abs(percentage).toFixed(2)) // Convert to a number
            };
        };

        // Prepare the response data
        const data = {
            totalUsers: {
                count: totalUsers,
                ...calculateChange(totalUsers, prevTotalUsers)
            },
            totalInflow: {
                current: totalInflow._sum.amountNaira || 0,
                ...calculateChange(totalInflow._sum.amountNaira || 0, prevTotalInflow._sum.amountNaira || 0)
            },
            totalOutflow: {
                current: totalOutflow._sum.amountNaira || 0,
                ...calculateChange(totalOutflow._sum.amountNaira || 0, prevTotalOutflow._sum.amountNaira || 0)
            },
            totalRevenue: {
                current: totalRevenue._sum.amountNaira || 0,
                ...calculateChange(totalRevenue._sum.amountNaira || 0, prevTotalRevenue._sum.amountNaira || 0)
            },
            totalTransactions: {
                count: totalTransactions,
                ...calculateChange(totalTransactions, prevTotalTransactions)
            },
            totalAgents: {
                count: totalAgents,
                ...calculateChange(totalAgents, prevTotalAgents)
            },
            totalVerifiedUsers: {
                count: verifiedCustomers,
                ...calculateChange(verifiedCustomers, prevVerifiedCustomers)
            },
            totalDepartments: {
                count: totalDepartments
            }
        };

        return new ApiResponse(
            200,
            data,
            'Dashboard stats fetched successfully'
        ).send(res);

    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        return next(ApiError.internal('Internal Server Error'));
    }
};
export const customerStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const totalCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer
            }
        })
        const verifiedCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,

                status: 'active'
            }

        })
        const offlineNow = 0;
        const totalCustomerChats = await prisma.chat.count({
            where: {
                chatType: ChatType.customer_to_agent
            }
        })
        const data = {
            totalCustomers: totalCustomers,
            verifiedCustomers: verifiedCustomers,
            offlineNow: offlineNow,
            totalCustomerChats: totalCustomerChats
        }
        return new ApiResponse(
            200,
            data,
            'Stats found successfully'
        ).send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        return next(ApiError.internal('Internal Server Error'));
    }
}
export const transactionStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;

        // Apply filter if the user is not an admin
        const userFilter = user.role !== UserRoles.admin ? {
            department: {
                assignedDepartments: {
                    some: {
                        agent: {
                            userId: user.id
                        }
                    }
                }
            }
        } : {};

        // Total Transactions
        const totalTransactions = await prisma.transaction.count({
            where: userFilter, // Apply filter for non-admins
        });

        // Total Transaction Amount Sum
        const totaltransactionAmountSum = await prisma.transaction.aggregate({
            where: userFilter, // Apply filter for non-admins
            _sum: {
                amount: true,
                amountNaira: true,
            },
        });

        // Crypto Transactions
        const cryptoTransactions = await prisma.transaction.aggregate({
            where: {
                ...userFilter, // Apply filter for non-admins
                department: {
                    niche: 'crypto',
                },
            },
            _count: true,
            _sum: {
                amount: true,
                amountNaira: true,
            },
        });

        // Gift Card Transactions
        const giftCardTransactions = await prisma.transaction.aggregate({
            where: {
                ...userFilter, // Apply filter for non-admins
                department: {
                    niche: 'giftCard',
                },
            },
            _count: true,
            _sum: {
                amount: true,
                amountNaira: true,
            },
        });

        // Combine data into a response object
        const data = {
            totalTransactions,
            totaltransactionAmountSum,
            cryptoTransactions,
            giftCardTransactions,
        };

        return new ApiResponse(200, data, 'Stats found successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        return next(ApiError.internal('Internal Server Error'));
    }
};


export const teamStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const totalUsers = await prisma.user.count();
        const totalAgents = await prisma.user.count({
            where: {
                role: UserRoles.agent
            }
        })
        const totalOnlineAgents = await prisma.agent.count({
            where: {
                AgentStatus: 'online'
            }
        })
        const totalofflineAgent = await prisma.agent.count({
            where: {
                AgentStatus: 'offline'
            }
        })
        const data = {
            totalUsers: totalUsers,
            totalAgents: totalAgents,
            totalOnlineAgents: totalOnlineAgents,
            totalOfflineAgents: totalofflineAgent
        }
        return new ApiResponse(
            200,
            data,
            'Stats found successfully'
        ).send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        return next(ApiError.internal('Internal Server Error'));
    }
}