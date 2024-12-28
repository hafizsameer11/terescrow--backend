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