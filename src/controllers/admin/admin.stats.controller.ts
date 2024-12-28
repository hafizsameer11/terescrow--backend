import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
const prisma = new PrismaClient();
export const getChatStats = async (req: Request, res: Response, next: NextFunction) => {

    try {
        const user = req.body._user;
        // const agentId = user.id;
        const totalChats = await prisma.chat.count({
            where: {
                chatType: ChatType.customer_to_agent,

            }
        })
        const successfulllTransactions = await prisma.transaction.count({
            where: {
                status: TransactionStatus.successful,
            },
        });
        const pendingChats = await prisma.chat.count({
            where: {
                chatDetails: {
                    status: ChatStatus.pending,
                },
            },
        });
        const declinedChats = await prisma.chat.count({
            where: {
                chatDetails: {
                    status: ChatStatus.declined,
                },
            },
        });
        const data = {
            totalChats: totalChats,
            successfulllTransactions: successfulllTransactions,
            pendingChats: pendingChats,
            declinedChats: declinedChats
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
        const totalTransactions = await prisma.transaction.count();
        const totaltransactionAmountSum = await prisma.transaction.aggregate({
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const cryptoTransactions = await prisma.transaction.aggregate({
            where: {
                department: {
                    niche: 'crypto'
                }
            },
            _count: true,
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const giftCardTransactions = await prisma.transaction.aggregate({
            where: {
                department: {
                    niche: 'giftCard'
                }
            },
            _count: true,
            _sum: {
                amount: true, amountNaira: true
            }
        })
        const data = {
            totalTransactions: totalTransactions,
            totaltransactionAmountSum: totaltransactionAmountSum,
            cryptoTransactions: cryptoTransactions,
            giftCardTransactions: giftCardTransactions
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