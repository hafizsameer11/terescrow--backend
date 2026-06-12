import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  getAdminTransactions,
  getAdminTransactionStats,
  NicheType,
  TransactionFilters,
} from '../../services/admin/transactions.admin.service';
import { revokeCryptoTransaction } from '../../services/admin/crypto.transaction.revoke.service';

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

export async function revokeCryptoTransactionController(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const transactionId = String(req.params.transactionId || '').trim();
    if (!transactionId) return next(ApiError.badRequest('transactionId is required'));
    const adminUserId = (req as any).user?.id as number | undefined;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
    const result = await revokeCryptoTransaction(transactionId, { adminUserId, reason });
    return new ApiResponse(200, result, 'Transaction revoked').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to revoke transaction'));
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
