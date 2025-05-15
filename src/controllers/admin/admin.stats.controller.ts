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
        const userFilter = user.role == UserRoles.customer ? {
            participants: { some: { userId: user.id } }
        } : {};

        // Date calculations for the current and previous month
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        // Fetch current month data
        const totalChats = await prisma.chat.count({ where: { chatType: ChatType.customer_to_agent, ...userFilter } });

        const successfulTransactions = await prisma.transaction.count({
            where: {
                status: TransactionStatus.successful,
                chat: { ...userFilter },
            },
        });

        const pendingChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.pending },
                ...userFilter,
            },
        });

        const declinedChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.declined },
                ...userFilter,
            },
        });

        const unsuccessfulChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.unsucessful },
                ...userFilter,
            },
        });

        // Previous month data for comparison
        const prevTotalChats = await prisma.chat.count({
            where: { chatType: ChatType.customer_to_agent, createdAt: { lt: currentMonthStart, gte: previousMonthStart }, ...userFilter },
        });

        const prevSuccessfulTransactions = await prisma.transaction.count({
            where: { status: TransactionStatus.successful, createdAt: { lt: currentMonthStart, gte: previousMonthStart }, chat: { ...userFilter } },
        });

        const prevPendingChats = await prisma.chat.count({
            where: { chatDetails: { status: ChatStatus.pending }, createdAt: { lt: currentMonthStart, gte: previousMonthStart }, ...userFilter },
        });

        const prevDeclinedChats = await prisma.chat.count({
            where: { chatDetails: { status: ChatStatus.declined }, createdAt: { lt: currentMonthStart, gte: previousMonthStart }, ...userFilter },
        });

        const prevUnsuccessfulChats = await prisma.chat.count({
            where: { chatDetails: { status: ChatStatus.unsucessful }, createdAt: { lt: currentMonthStart, gte: previousMonthStart }, ...userFilter },
        });

        // Function to calculate percentage change
        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return { change: 'positive', percentage: 100 };
            const difference = current - previous;
            const percentage = (difference / previous) * 100;
            return {
                change: difference >= 0 ? 'positive' : 'negative',
                percentage: parseFloat(Math.abs(percentage).toFixed(2))
            };
        };

        // Combine data into a single response object
        const data = {
            totalChats: {
                count: totalChats,
                ...calculateChange(totalChats, prevTotalChats),
            },
            successfulTransactions: {
                count: successfulTransactions,
                ...calculateChange(successfulTransactions, prevSuccessfulTransactions),
            },
            pendingChats: {
                count: pendingChats,
                ...calculateChange(pendingChats, prevPendingChats),
            },
            declinedChats: {
                count: declinedChats,
                ...calculateChange(declinedChats, prevDeclinedChats),
            },
            unsuccessfulChats: {
                count: unsuccessfulChats,
                ...calculateChange(unsuccessfulChats, prevUnsuccessfulChats),
            },
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
                current: totalInflow._sum.profit || 0,
                ...calculateChange(totalInflow._sum.profit || 0, prevTotalInflow._sum.profit || 0)
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
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        // Current month data
        const totalCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer
            }
        });
        const verifiedCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                status: 'active'
            }
        });
        const offlineNow = 0;
        const totalCustomerChats = await prisma.chat.count({
            where: {
                chatType: ChatType.customer_to_agent
            }
        });

        // Previous month data for comparison
        const prevTotalCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const prevVerifiedCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                status: 'active',
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const prevTotalCustomerChats = await prisma.chat.count({
            where: {
                chatType: ChatType.customer_to_agent,
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart
                }
            }
        });
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);

        const todayCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                createdAt: {
                    gte: todayStart
                }
            }
        });

        const yesterdayCustomers = await prisma.user.count({
            where: {
                role: UserRoles.customer,
                createdAt: {
                    gte: yesterdayStart,
                    lt: todayStart
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
                percentage: parseFloat(Math.abs(percentage).toFixed(2))
            };
        };

        // Prepare response data
        const data = {
            totalCustomers: {
                count: totalCustomers,
                ...calculateChange(totalCustomers, prevTotalCustomers)
            },
            verifiedCustomers: {
                count: verifiedCustomers,
                ...calculateChange(verifiedCustomers, prevVerifiedCustomers)
            },
            offlineNow: {
                count: offlineNow,
                change: 'neutral',
                percentage: 0
            },
            totalCustomerChats: {
                count: totalCustomerChats,
                ...calculateChange(totalCustomerChats, prevTotalCustomerChats)
            },
            todayCustomers: {
                count: todayCustomers,
                ...calculateChange(todayCustomers, yesterdayCustomers)
            }
        };

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
};

export const transactionStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;

        // Apply filter if the user is not an admin
        const userFilter = user.role == UserRoles.customer ? {
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

        // Date calculations for the current and previous month
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        // Fetch current month data
        const totalTransactions = await prisma.transaction.count({ where: userFilter });

        const totalTransactionAmountSum = await prisma.transaction.aggregate({
            where: userFilter,
            _sum: { amount: true, amountNaira: true },
        });

        const cryptoTransactions = await prisma.transaction.aggregate({
            where: {
                ...userFilter,
                department: { niche: 'crypto' },
            },
            _count: true,
            _sum: { amount: true, amountNaira: true },
        });

        const giftCardTransactions = await prisma.transaction.aggregate({
            where: {
                ...userFilter,
                department: { niche: 'giftCard' },
            },
            _count: true,
            _sum: { amount: true, amountNaira: true },
        });

        // Fetch previous month data for comparison
        const prevTotalTransactions = await prisma.transaction.count({
            where: { ...userFilter, createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
        });

        const prevTotalTransactionAmountSum = await prisma.transaction.aggregate({
            where: { ...userFilter, createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
            _sum: { amount: true, amountNaira: true },
        });

        const prevCryptoTransactions = await prisma.transaction.aggregate({
            where: { ...userFilter, department: { niche: 'crypto' }, createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
            _count: true,
            _sum: { amount: true, amountNaira: true },
        });

        const prevGiftCardTransactions = await prisma.transaction.aggregate({
            where: { ...userFilter, department: { niche: 'giftCard' }, createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
            _count: true,
            _sum: { amount: true, amountNaira: true },
        });

        // Function to calculate percentage change
        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return { change: 'positive', percentage: 100 };
            const difference = current - previous;
            const percentage = (difference / previous) * 100;
            return {
                change: difference >= 0 ? 'positive' : 'negative',
                percentage: parseFloat(Math.abs(percentage).toFixed(2))
            };
        };

        // Combine data into a response object with comparisons
        const data = {
            totalTransactions: {
                count: totalTransactions,
                ...calculateChange(totalTransactions, prevTotalTransactions),
            },
            totalTransactionAmountSum: {
                _sum: totalTransactionAmountSum._sum,
                ...calculateChange(totalTransactionAmountSum._sum.amount || 0, prevTotalTransactionAmountSum._sum.amount || 0),
            },
            cryptoTransactions: {
                _count: cryptoTransactions._count,
                _sum: cryptoTransactions._sum,
                ...calculateChange(cryptoTransactions._count, prevCryptoTransactions._count),
            },
            giftCardTransactions: {
                _count: giftCardTransactions._count,
                _sum: giftCardTransactions._sum,
                ...calculateChange(giftCardTransactions._count, prevGiftCardTransactions._count),
            },
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