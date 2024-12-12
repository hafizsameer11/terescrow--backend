import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../utils/ApiResponse';
import ApiError from '../utils/ApiError';
import { Gender, PrismaClient, User, UserRoles } from '@prisma/client';
import { DepartmentStatus, AssignedDepartment } from '@prisma/client';
import { hashPassword } from '../utils/authUtils';
import { validationResult } from 'express-validator';
import upload from '../middlewares/multer.middleware';

const prisma = new PrismaClient();
//create transaction route
export const createTransactionCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract agentId from auth middleware
        const { id: agentId } = req.body._user;
        const {
            departmentId,
            categoryId,
            subCategoryId,
            countryId,
            customerId,
            cardType,
            cardNumber,
            amount,
            exchangeRate,
            amountNaira,
            status,
        } = req.body;
        if (
            !departmentId ||
            !categoryId ||
            !subCategoryId ||
            !countryId ||
            !amount || !customerId
        ) {
            return next(ApiError.badRequest('Missing required fields'));
        }
        const transaction = await prisma.transaction.create({
            data: {
                departmentId: parseInt(departmentId, 10),
                categoryId: parseInt(categoryId, 10),
                subCategoryId: parseInt(subCategoryId, 10),
                countryId: parseInt(countryId, 10),
                cardType: cardType || null,
                cardNumber: cardNumber || null,
                amount: parseFloat(amount),
                exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
                amountNaira: amountNaira ? parseFloat(amountNaira) : null,
                agentId, // From the authenticated user
                cryptoAmount: null,
                fromAddress:  null,
                toAddress:  null,
                status: status || 'pending',
                customerId: parseInt(customerId, 10)
            },
        });
        if (!transaction) {
            return next(ApiError.badRequest('Transaction not created'));
        }
        return new ApiResponse(201, transaction, 'Transaction created successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            next(error);
            return;
        }
        next(ApiError.internal('Internal Server Error'));
    }
};
export const createTransactionCrypto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract agentId from auth middleware
        const { id: agentId } = req.body._user;
        const {
            departmentId,
            categoryId,
            subCategoryId,
            countryId,
            customerId,
            amount,
            exchangeRate,
            amountNaira,
            cryptoAmount,
            fromAddress,
            toAddress,
            status,
        } = req.body;

        // Validate required fields
        if (
            !departmentId ||
            !categoryId ||
            !subCategoryId ||
            !countryId ||
            !amount || !customerId
        ) {
            return next(ApiError.badRequest('Missing required fields'));
        }

        // Create a new transaction
        const transaction = await prisma.transaction.create({
            data: {
                departmentId: parseInt(departmentId, 10),
                categoryId: parseInt(categoryId, 10),
                subCategoryId: parseInt(subCategoryId, 10),
                countryId: parseInt(countryId, 10),
                cardType:  null,
                cardNumber:  null,
                amount: parseFloat(amount),
                exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
                amountNaira: amountNaira ? parseFloat(amountNaira) : null,
                agentId,
                cryptoAmount: cryptoAmount ? parseFloat(cryptoAmount) : null,
                fromAddress: fromAddress || null,
                toAddress: toAddress || null,
                status: status || 'pending', // Default status if not provided
                customerId: parseInt(customerId, 10)
            },
        });
        if (!transaction) {
            return next(ApiError.badRequest('Transaction not created'));
        }
        return new ApiResponse(201, transaction, 'Transaction created successfully').send(res);
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            next(error);
            return;
        }
        next(ApiError.internal('Internal Server Error'));
    }
};

export const getTransactionsForAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract agentId from auth middleware
        const { id: agentId } = req.body._user;

        // Fetch transactions for the agent
        const transactions = await prisma.transaction.findMany({
            where: {
                agentId,
            },
            include: {
                agent: {
                    include: {
                        user: true,
                    },
                    select: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                firstname: true,
                                lastname: true,
                                email: true,
                                phoneNumber: true,
                                gender: true,
                                country: true,
                            },
                        },

                    },
                }
            }
        });
    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            next(error);
            return;
        }
        next(ApiError.internal('Internal Server Error'));
    }
}
export const getTrsanactionforUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract agentId from auth middleware
        // const { id: agentId } = req.body._user;c
        const { id: customerId } = req.body._user

        // Fetch transactions for the agent
        const transactions = await prisma.transaction.findMany({
            where: {
                customerId,
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        username: true,
                    },
                }
            }
        });
        // res.json(transactions);
        return new ApiResponse(200, transactions, 'Transactions fetched successfully').send(res);

    } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
            next(error);
            return;
        }
        next(ApiError.internal('Internal Server Error'));
    }
    //get 10 latest transactions
    // const latestTransactions = transactions.slice(-10);
}
export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract query params for pagination, default to latest 10 transactions
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const latestOnly = !req.query.page && !req.query.limit;

        // Calculate the offset for pagination
        const skip = latestOnly ? 0 : (page - 1) * limit;
        const take = latestOnly ? 10 : limit;

        // Fetch transactions
        const transactions = await prisma.transaction.findMany({
            skip,    // Skip records for pagination
            take,    // Limit records returned
            orderBy: {
                createdAt: 'desc',  // Sort by creation date
            },
            include: {
                agent: {
                    select: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                            },
                        },
                    },
                },
                customer: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
            },
        });

        // Count total records for pagination
        const totalRecords = await prisma.transaction.count();

        // Build response based on mode
        const response = {
            message: latestOnly
                ? 'Latest 10 transactions fetched successfully'
                : 'Paginated transactions fetched successfully',
            currentPage: latestOnly ? 1 : page,
            totalPages: latestOnly ? 1 : Math.ceil(totalRecords / limit),
            totalRecords,
            data: transactions,
        };

        if (transactions.length === 0) {
            response.message = 'No transactions found';
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error(error);
        next(ApiError.internal('Internal Server Error'));
    }
};
