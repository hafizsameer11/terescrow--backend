import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  getDepositVerificationLog,
  listDepositVerificationLogs,
  retryDepositVerification,
} from '../../services/admin/deposit.verification.admin.service';

export async function listDepositVerificationLogsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const result = await listDepositVerificationLogs({
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      status,
      search,
    });
    return new ApiResponse(200, result, 'Deposit verification logs retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list deposit verification logs'));
  }
}

export async function getDepositVerificationLogController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return next(ApiError.badRequest('Invalid id'));
    }
    const row = await getDepositVerificationLog(id);
    if (!row) {
      return next(ApiError.notFound('Deposit verification log not found'));
    }
    return new ApiResponse(200, row, 'Deposit verification log retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to get deposit verification log'));
  }
}

export async function retryDepositVerificationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return next(ApiError.badRequest('Invalid id'));
    }
    await retryDepositVerification(id);
    return new ApiResponse(200, { id }, 'Deposit verification retry queued').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    const message = error instanceof Error ? error.message : 'Failed to retry deposit verification';
    if (message.includes('not found')) return next(ApiError.notFound(message));
    if (message.includes('already verified')) return next(ApiError.badRequest(message));
    return next(ApiError.internal(message));
  }
}
