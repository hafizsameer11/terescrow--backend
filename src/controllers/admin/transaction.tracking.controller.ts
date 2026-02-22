import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import * as trackingService from '../../services/admin/transaction.tracking.service';

export async function getTransactionTrackingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await trackingService.getTransactionTrackingList({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });
    return new ApiResponse(200, result, 'On-chain received transactions retrieved').send(res);
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
    const steps = await trackingService.getTrackingSteps(txId);
    return new ApiResponse(200, { steps }, 'Tracking steps retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get tracking steps'));
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
    const details = await trackingService.getTrackingDetails(txId);
    if (!details) return next(ApiError.notFound('Received transaction not found'));
    return new ApiResponse(200, details, 'Transaction details retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get transaction details'));
  }
}
