import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
import { resolveStatsTimeWindow } from '../../utils/statsTimeWindow';
import { getAdminTransactionStats } from '../../services/admin/transactions.admin.service';
const prisma = new PrismaClient();
export const getChatStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.body._user;
        const timeWindow = (req.query.timeWindow as string) || 'all';
        const startParam = req.query.start as string | undefined;
        const endParam = req.query.end as string | undefined;

        let createdAtFilter: { gte?: Date; lte?: Date } | undefined;
        if (startParam || endParam) {
            createdAtFilter = {};
            if (startParam) createdAtFilter.gte = new Date(startParam);
            if (endParam) createdAtFilter.lte = new Date(endParam);
        } else {
            const window = resolveStatsTimeWindow(timeWindow);
            if (window.gte || window.lte) createdAtFilter = window;
        }

        // Conditions for filtering based on the user's role
        const userFilter = user.role == UserRoles.customer ? {
            participants: { some: { userId: user.id } }
        } : {};

        const chatTimeFilter = createdAtFilter ? { updatedAt: createdAtFilter } : {};

        // Date calculations for the current and previous month
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        // Fetch current month data
        const totalChats = await prisma.chat.count({ where: { chatType: ChatType.customer_to_agent, ...userFilter, ...chatTimeFilter } });

        const successfulTransactions = await prisma.transaction.count({
            where: {
                status: TransactionStatus.successful,
                chat: { ...userFilter, ...chatTimeFilter },
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
        });

        const pendingChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.pending },
                participants: {
                    some: {
                        user: {
                            role: UserRoles.agent,
                        },
                    },
                },
                ...userFilter,
                ...chatTimeFilter,
            },
        });


        const declinedChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.declined },
                ...userFilter,
                ...chatTimeFilter,
            },
        });

        const unsuccessfulChats = await prisma.chat.count({
            where: {
                chatDetails: { status: ChatStatus.unsucessful },
                ...userFilter,
                ...chatTimeFilter,
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
            where: {
                chatDetails: { status: ChatStatus.pending },
                participants: {
                    some: {
                        user: {
                            role: UserRoles.agent,
                        },
                    },
                },
                createdAt: {
                    lt: currentMonthStart,
                    gte: previousMonthStart,
                },
                ...userFilter,
            },
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
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        const previousMonthStart = new Date(currentMonthStart);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

        const totalUsers = await prisma.user.count();
        const totalAgents = await prisma.user.count({ where: { role: 'agent' } });
        const verifiedCustomers = await prisma.user.count({
            where: { KycStateTwo: { some: {} } },
        });
        const totalDepartments = await prisma.department.count();

        const prevTotalUsers = await prisma.user.count({
            where: { createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
        });
        const prevTotalAgents = await prisma.user.count({
            where: { role: 'agent', createdAt: { lt: currentMonthStart, gte: previousMonthStart } },
        });
        const prevVerifiedCustomers = await prisma.user.count({
            where: {
                KycStateTwo: { some: {} },
                createdAt: { lt: currentMonthStart, gte: previousMonthStart },
            },
        });

        // Money metrics from live providers (Busha / Pagocard / StroWallet / PalmPay)
        const providerStats = await getAdminTransactionStats({});
        const nairaIn = Number(providerStats.nairaTransactions?._sum?.amountNaira || 0);
        const billOut = Number(providerStats.billPaymentTransactions?._sum?.amountNaira || 0);
        const cryptoNaira = Number(providerStats.cryptoTransactions?._sum?.amountNaira || 0);
        const giftUsd = Number(providerStats.giftCardTransactions?._sum?.amount || 0);
        const totalTxCount = Number(providerStats.totalTransactions?.count || 0);
        const revenueNaira = nairaIn + cryptoNaira + billOut;

        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return { change: 'positive', percentage: current > 0 ? 100 : 0 };
            const difference = current - previous;
            const percentage = (difference / previous) * 100;
            return {
                change: difference >= 0 ? 'positive' : 'negative',
                percentage: parseFloat(Math.abs(percentage).toFixed(2)),
            };
        };

        const data = {
            totalUsers: {
                count: totalUsers,
                ...calculateChange(totalUsers, prevTotalUsers),
            },
            totalInflow: {
                current: nairaIn,
                change: providerStats.nairaTransactions?.change,
                percentage: providerStats.nairaTransactions?.percentage,
            },
            totalOutflow: {
                current: billOut,
                change: providerStats.billPaymentTransactions?.change,
                percentage: providerStats.billPaymentTransactions?.percentage,
            },
            totalRevenue: {
                current: revenueNaira,
                change: providerStats.totalTransactionAmountSum?.change,
                percentage: providerStats.totalTransactionAmountSum?.percentage,
            },
            totalTransactions: {
                ...providerStats.totalTransactions,
                count: totalTxCount,
            },
            totalAgents: {
                count: totalAgents,
                ...calculateChange(totalAgents, prevTotalAgents),
            },
            totalVerifiedUsers: {
                count: verifiedCustomers,
                ...calculateChange(verifiedCustomers, prevVerifiedCustomers),
            },
            totalDepartments: {
                count: totalDepartments,
            },
            providerBreakdown: {
                bushaCrypto: providerStats.cryptoTransactions,
                pagocardGiftCards: { ...providerStats.giftCardTransactions, amountUsd: giftUsd },
                billPayments: providerStats.billPaymentTransactions,
                palmpayNaira: providerStats.nairaTransactions,
            },
        };

        return new ApiResponse(200, data, 'Dashboard stats fetched successfully').send(res);
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
        const data = await getAdminTransactionStats({});
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