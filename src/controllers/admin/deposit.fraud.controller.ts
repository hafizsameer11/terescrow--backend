import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { listLockedDeposits } from '../../services/tatum/deposit.fraud.lock.service';

export async function listLockedDepositsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await listLockedDeposits({
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return new ApiResponse(200, result, 'Locked fraud deposits retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to list locked deposits'));
  }
}
