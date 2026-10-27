import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  listHeldVaDeposits,
  approveHeldVaDeposit,
  rejectHeldVaDeposit,
} from '../../services/palmpay/palmpay.va.deposit.review.service';

export async function listHeldVaDepositsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await listHeldVaDeposits({
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return new ApiResponse(200, result, 'Held VA deposits retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list held VA deposits'));
  }
}

export async function approveHeldVaDepositController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const admin = (req as any).user || req.body._user;
    if (!admin?.id) return next(ApiError.unauthorized('Admin not authenticated'));
    const transactionId = String(req.params.id || '').trim();
    if (!transactionId) return next(ApiError.badRequest('Transaction id required'));
    const note = req.body?.note ? String(req.body.note) : undefined;
    const tx = await approveHeldVaDeposit({
      transactionId,
      adminUserId: admin.id,
      note,
    });
    return new ApiResponse(200, tx, 'Deposit approved and credited').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to approve held deposit'));
  }
}

export async function rejectHeldVaDepositController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const admin = (req as any).user || req.body._user;
    if (!admin?.id) return next(ApiError.unauthorized('Admin not authenticated'));
    const transactionId = String(req.params.id || '').trim();
    if (!transactionId) return next(ApiError.badRequest('Transaction id required'));
    const note = req.body?.note ? String(req.body.note) : undefined;
    const tx = await rejectHeldVaDeposit({
      transactionId,
      adminUserId: admin.id,
      note,
    });
    return new ApiResponse(200, tx, 'Deposit rejected — held permanently').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to reject held deposit'));
  }
}
