import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import * as referralsAdminService from '../../services/admin/referrals.admin.service';

export async function getReferralsSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await referralsAdminService.getReferralSummary({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    return new ApiResponse(200, summary, 'Referrals summary retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get referrals summary'));
  }
}

export async function getReferralsListController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await referralsAdminService.getReferralsList({
      type: req.query.type as string,
      search: req.query.search as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });
    return new ApiResponse(200, result, 'Referrals list retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get referrals list'));
  }
}

export async function getReferralsByUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return next(ApiError.badRequest('Invalid user id'));
    const list = await referralsAdminService.getReferralsByUser(userId);
    if (list === null) return next(ApiError.notFound('User not found'));
    return new ApiResponse(200, { referrals: list }, 'Referrals by user retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get referrals by user'));
  }
}

export async function getEarnSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await referralsAdminService.getEarnSettings();
    return new ApiResponse(200, settings, 'Earn settings retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get earn settings'));
  }
}

export async function putEarnSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstTimeDepositBonusPct, commissionReferralTradesPct, commissionDownlineTradesPct } = req.body;
    const settings = await referralsAdminService.updateEarnSettings({
      firstTimeDepositBonusPct,
      commissionReferralTradesPct,
      commissionDownlineTradesPct,
    });
    return new ApiResponse(200, settings, 'Earn settings updated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to update earn settings'));
  }
}
