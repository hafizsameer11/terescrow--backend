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

        // Combine results into a single object
        const data = {
            totalChats,
            successfulTransactions,
            pendingChats,
            declinedChats,
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
        const totalUsers = await prisma.user.count();
        const totalInflow = await prisma.transaction.aggregate({
            where: {
                department: {
                    Type: 'sell'
                }
            },
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const totalOutflow = await prisma.transaction.aggregate({
            where: {
                department: {
                    Type: 'buy'
                }
            },
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const totatlRevenew = await prisma.transaction.aggregate({
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const totalTransactions = await prisma.transaction.count();
        const totalAgents = await prisma.user.count({
            where: {
                role: UserRoles.agent
            }
        })
        const totalDepartments = await prisma.department.count();
        const data = {
            totalUsers: totalUsers,
            totalInflow: totalInflow,
            totalOutflow: totalOutflow,
            totatlRevenew: totatlRevenew,
            totalTransactions: totalTransactions,
            totalDepartments: totalDepartments,
            totalAgents: totalAgents
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
                KycStateTwo: {
                    some: {}

                }
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