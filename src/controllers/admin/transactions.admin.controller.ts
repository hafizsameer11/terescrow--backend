import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { getAdminTransactions, AdminTransactionType } from '../../services/admin/transactions.admin.service';

const VALID_TYPES: AdminTransactionType[] = ['giftCards', 'crypto', 'billPayments', 'naira'];

export async function getAdminTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const transactionType = req.query.transactionType as string | undefined;
    if (transactionType && !VALID_TYPES.includes(transactionType as AdminTransactionType)) {
      return next(ApiError.badRequest(`transactionType must be one of: ${VALID_TYPES.join(', ')}`));
    }
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await getAdminTransactions({
      transactionType: transactionType as AdminTransactionType | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      search: req.query.search as string | undefined,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });
    return new ApiResponse(200, result, 'Transactions retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch transactions'));
  }
}
