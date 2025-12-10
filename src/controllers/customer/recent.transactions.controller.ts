/**
 * Recent Transactions Controller
 * 
 * Handles requests for recent transactions from all types
 */

import { Request, Response, NextFunction } from 'express';
import recentTransactionsService from '../../services/transaction/recent.transactions.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Get recent transactions from all types
 * GET /api/v2/transactions/recent
 */
export async function getRecentTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return next(ApiError.badRequest('Limit must be between 1 and 100'));
    }

    if (offset < 0) {
      return next(ApiError.badRequest('Offset must be 0 or greater'));
    }

    const result = await recentTransactionsService.getRecentTransactions(userId, limit, offset);

    return new ApiResponse(
      200,
      result,
      'Recent transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getRecentTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve recent transactions'));
  }
}

