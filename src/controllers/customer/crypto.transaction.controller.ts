/**
 * Crypto Transaction Controller
 * 
 * Handles HTTP requests for crypto transactions
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import cryptoTransactionService from '../../services/crypto/crypto.transaction.service';
import { prisma } from '../../utils/prisma';

/**
 * Get user's crypto transactions
 */
export const getUserCryptoTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }
    const transactionType = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get real transactions
    const result = await cryptoTransactionService.getUserTransactions(
      userId,
      transactionType as any,
      limit,
      offset
    );

    return new ApiResponse(
      200,
      result,
      'Crypto transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getUserCryptoTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve crypto transactions'));
  }
};

/**
 * Get transaction by ID
 */
export const getCryptoTransactionByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { transactionId } = req.params;

    const transaction = await cryptoTransactionService.getTransactionById(transactionId, userId);

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    return new ApiResponse(
      200,
      transaction,
      'Transaction retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getCryptoTransactionByIdController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve transaction'));
  }
};

/**
 * Get all USDT transactions
 */
export const getUsdtTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const transactionType = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get USDT transactions
    const result = await cryptoTransactionService.getUsdtTransactions(
      userId,
      transactionType as any,
      limit,
      offset
    );

    return new ApiResponse(
      200,
      result,
      'USDT transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getUsdtTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve USDT transactions'));
  }
};

/**
 * Get transactions for a specific virtual account
 */
export const getVirtualAccountTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const virtualAccountId = parseInt(req.params.virtualAccountId);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (isNaN(virtualAccountId)) {
      return next(ApiError.badRequest('Invalid virtual account ID'));
    }

    // Verify virtual account belongs to user
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: { id: virtualAccountId, userId },
      include: {
        walletCurrency: true,
      },
    });

    if (!virtualAccount) {
      return next(ApiError.notFound('Virtual account not found'));
    }

    // Get real transactions
    const result = await cryptoTransactionService.getVirtualAccountTransactions(
      userId,
      virtualAccountId,
      limit,
      offset
    );

    return new ApiResponse(
      200,
      result,
      'Virtual account transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getVirtualAccountTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve transactions'));
  }
};


