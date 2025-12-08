/**
 * Transaction Overview Controller
 * 
 * Handles HTTP requests for transaction overview and chart data
 */

import { Request, Response, NextFunction } from 'express';
import transactionOverviewService from '../../services/transaction/transaction.overview.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Get transaction overview with chart data and history grouped by type
 */
export async function getTransactionOverviewController(
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

    const overview = await transactionOverviewService.getTransactionOverview(userId);

    return new ApiResponse(
      200,
      overview,
      'Transaction overview retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getTransactionOverviewController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to retrieve transaction overview'));
  }
}

