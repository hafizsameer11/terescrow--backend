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

// Legacy earn settings (backward compat)
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

// ──────────────────────────────────────────────────────
// New Commission Settings (per-service)
// ──────────────────────────────────────────────────────

export async function getCommissionSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await referralsAdminService.getCommissionSettings();
    return new ApiResponse(200, settings, 'Commission settings retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get commission settings'));
  }
}

export async function upsertCommissionSettingController(req: Request, res: Response, next: NextFunction) {
  try {
    const { service, commissionType, commissionValue, level2Pct, signupBonus, minFirstWithdrawal, isActive } = req.body;

    if (!service || !commissionType || commissionValue === undefined) {
      return next(ApiError.badRequest('Missing required fields: service, commissionType, commissionValue'));
    }

    const validServices = ['BILL_PAYMENT', 'GIFT_CARD_BUY', 'GIFT_CARD_SELL', 'CRYPTO_BUY', 'CRYPTO_SELL'];
    if (!validServices.includes(service)) {
      return next(ApiError.badRequest('Invalid service'));
    }
    if (!['PERCENTAGE', 'FIXED'].includes(commissionType)) {
      return next(ApiError.badRequest('commissionType must be PERCENTAGE or FIXED'));
    }

    const result = await referralsAdminService.upsertCommissionSetting({
      service,
      commissionType,
      commissionValue: parseFloat(commissionValue),
      level2Pct: level2Pct !== undefined ? parseFloat(level2Pct) : undefined,
      signupBonus: signupBonus !== undefined ? parseFloat(signupBonus) : undefined,
      minFirstWithdrawal: minFirstWithdrawal !== undefined ? parseFloat(minFirstWithdrawal) : undefined,
      isActive,
    });

    return new ApiResponse(200, result, 'Commission setting saved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to save commission setting'));
  }
}

// ──────────────────────────────────────────────────────
// Per-User Overrides
// ──────────────────────────────────────────────────────

export async function getUserOverridesController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return next(ApiError.badRequest('Invalid user id'));
    const overrides = await referralsAdminService.getUserOverrides(userId);
    return new ApiResponse(200, overrides, 'User overrides retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get user overrides'));
  }
}

export async function upsertUserOverrideController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return next(ApiError.badRequest('Invalid user id'));

    const { service, commissionType, commissionValue } = req.body;

    if (!service || !commissionType || commissionValue === undefined) {
      return next(ApiError.badRequest('Missing required fields: service, commissionType, commissionValue'));
    }

    const result = await referralsAdminService.upsertUserOverride({
      userId,
      service,
      commissionType,
      commissionValue: parseFloat(commissionValue),
    });

    return new ApiResponse(200, result, 'User override saved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to save user override'));
  }
}

export async function deleteUserOverrideController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { service } = req.params;
    if (isNaN(userId)) return next(ApiError.badRequest('Invalid user id'));

    await referralsAdminService.deleteUserOverride(userId, service as any);
    return new ApiResponse(200, null, 'User override deleted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to delete user override'));
  }
}
