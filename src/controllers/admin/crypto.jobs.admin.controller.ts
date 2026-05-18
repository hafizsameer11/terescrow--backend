import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import * as cryptoJobsService from '../../services/admin/crypto.jobs.admin.service';

export async function getFailedCryptoJobsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const items = await cryptoJobsService.listFailedCryptoJobs(
      Number.isFinite(limit) ? limit : 50
    );
    return new ApiResponse(200, { items }, 'Failed jobs retrieved').send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal(error?.message || 'Failed to list crypto jobs'));
  }
}

export async function retryCryptoJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { queueName, jobId } = req.body || {};
    if (!queueName || !jobId) {
      return next(ApiError.badRequest('queueName and jobId are required'));
    }
    await cryptoJobsService.retryFailedCryptoJob(String(queueName), String(jobId));
    return new ApiResponse(200, undefined, 'Job queued for retry').send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.badRequest(error?.message || 'Failed to retry job'));
  }
}
