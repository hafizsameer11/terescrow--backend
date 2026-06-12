import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import {
  getPlatformOperationSettings,
  updatePlatformOperationSettings,
} from '../../services/admin/platform.operation.settings.service';

export async function getPlatformOperationSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const settings = await getPlatformOperationSettings();
    return new ApiResponse(200, settings, 'Platform operation settings fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch platform operation settings'));
  }
}

export async function putPlatformOperationSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { palmpayWithdrawDisabled, cryptoOutsideSendDisabled } = req.body ?? {};
    if (
      palmpayWithdrawDisabled !== undefined &&
      typeof palmpayWithdrawDisabled !== 'boolean'
    ) {
      return next(ApiError.badRequest('palmpayWithdrawDisabled must be a boolean'));
    }
    if (
      cryptoOutsideSendDisabled !== undefined &&
      typeof cryptoOutsideSendDisabled !== 'boolean'
    ) {
      return next(ApiError.badRequest('cryptoOutsideSendDisabled must be a boolean'));
    }
    const settings = await updatePlatformOperationSettings({
      palmpayWithdrawDisabled,
      cryptoOutsideSendDisabled,
    });
    return new ApiResponse(200, settings, 'Platform operation settings updated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to update platform operation settings'));
  }
}
