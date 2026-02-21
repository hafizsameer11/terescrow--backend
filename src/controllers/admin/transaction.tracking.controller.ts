import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import * as transactionTrackingService from '../../services/admin/transaction.tracking.service';

export async function getTransactionTrackingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await transactionTrackingService.getTransactionTrackingList({
      txType: req.query.txType as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });
    return new ApiResponse(200, result, 'Transaction tracking list retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get transaction tracking'));
  }
}

export async function getTrackingStepsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const txId = req.params.txId;
    if (!txId) return next(ApiError.badRequest('txId required'));
    const steps = await transactionTrackingService.getTrackingSteps(txId);
    return new ApiResponse(200, { steps }, 'Steps retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get steps'));
  }
}

export async function getTrackingDetailsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const txId = req.params.txId;
    if (!txId) return next(ApiError.badRequest('txId required'));
    const details = await transactionTrackingService.getTrackingDetails(txId);
    if (!details) return next(ApiError.notFound('Transaction not found'));
    return new ApiResponse(200, details, 'Details retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get details'));
  }
}
