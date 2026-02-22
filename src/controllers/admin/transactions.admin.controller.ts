import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  getAdminTransactions,
  getAdminTransactionStats,
  NicheType,
  TransactionFilters,
} from '../../services/admin/transactions.admin.service';

const VALID_NICHES: NicheType[] = ['crypto', 'giftcard', 'billpayment', 'naira'];

function parseFilters(req: Request, customerId?: number): TransactionFilters {
  const niche = req.query.niche as string | undefined;
  const type = req.query.type as string | undefined;
  const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  return {
    niche: niche && VALID_NICHES.includes(niche as NicheType) ? (niche as NicheType) : undefined,
    type: type === 'buy' || type === 'sell' ? type : undefined,
    status: (req.query.status as string) || undefined,
    search: (req.query.search as string) || undefined,
    startDate: (req.query.startDate as string) || undefined,
    endDate: (req.query.endDate as string) || undefined,
    page: isNaN(page as number) ? undefined : page,
    limit: isNaN(limit as number) ? undefined : limit,
    customerId,
  };
}

export async function getAdminTransactionsController(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const result = await getAdminTransactions(parseFilters(req));
    return new ApiResponse(200, result, 'Transactions retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch transactions'));
  }
}

export async function getAdminTransactionsByCustomerController(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customerId'));
    const result = await getAdminTransactions(parseFilters(req, customerId));
    return new ApiResponse(200, result, 'Customer transactions retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch customer transactions'));
  }
}

export async function getAdminTransactionStatsController(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const niche = req.query.niche as string | undefined;
    const stats = await getAdminTransactionStats({
      niche: niche && VALID_NICHES.includes(niche as NicheType) ? (niche as NicheType) : undefined,
      startDate: (req.query.startDate as string) || undefined,
      endDate: (req.query.endDate as string) || undefined,
    });
    return new ApiResponse(200, stats, 'Transaction stats retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch transaction stats'));
  }
}
