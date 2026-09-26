import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import {
  getCustomerRestrictions,
  isFeatureFrozen,
  FEATURE_DEPOSIT,
} from '../../utils/customer.restrictions';
import {
  createPersonalPermanentVa,
  getFundVirtualAccountForUser,
  getStoredBvnHint,
  refreshPermanentVaFromPalmPay,
  serializePermanentVa,
} from '../../services/palmpay/palmpay.permanent.va.lifecycle';
import { toCustomerSafeError } from '../../utils/customerSafeError';

/**
 * GET /api/v2/payments/palmpay/deposit/virtual-account
 */
export const getPermanentVirtualAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('User not authenticated'));

    const row = await getFundVirtualAccountForUser(user.id);
    const bvnHint = await getStoredBvnHint(user.id);

    return new ApiResponse(
      200,
      {
        virtualAccount: serializePermanentVa(row),
        /** Prefill for create form only — full BVN when we already have one from KYC / prior attempt */
        bvnPrefill: row?.status === 'approved' ? null : bvnHint,
      },
      row ? 'Funding account retrieved' : 'No funding account yet'
    ).send(res);
  } catch (error: any) {
    return next(toCustomerSafeError(error, 'Failed to load funding account'));
  }
};

/**
 * POST /api/v2/payments/palmpay/deposit/virtual-account
 * Body: { bvn }
 */
export const createPermanentVirtualAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('User not authenticated'));

    const restrictions = await getCustomerRestrictions(user.id);
    if (restrictions.banned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }
    if (isFeatureFrozen(restrictions, FEATURE_DEPOSIT)) {
      return next(ApiError.forbidden('Deposit is temporarily disabled for your account.'));
    }

    const bvn = String(req.body?.bvn || '').replace(/\s+/g, '');
    if (!/^\d{11}$/.test(bvn)) {
      return next(ApiError.badRequest('BVN must be exactly 11 digits'));
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        firstname: true,
        lastname: true,
        email: true,
        phoneNumber: true,
      },
    });

    const row = await createPersonalPermanentVa({
      userId: user.id,
      bvn,
      email: profile?.email || user.email,
      phone: profile?.phoneNumber || user.phoneNumber,
      firstName: profile?.firstname || user.firstname,
      lastName: profile?.lastname || user.lastname,
    });

    return new ApiResponse(
      200,
      {
        virtualAccount: serializePermanentVa(row),
        message:
          'Submitted successfully. You will be notified once your funding account is approved.',
      },
      'Funding account submitted'
    ).send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    return next(toCustomerSafeError(error, 'Failed to create funding account'));
  }
};

/**
 * POST /api/v2/payments/palmpay/deposit/virtual-account/refresh
 */
export const refreshPermanentVirtualAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('User not authenticated'));

    const row = await refreshPermanentVaFromPalmPay(user.id);
    return new ApiResponse(
      200,
      { virtualAccount: serializePermanentVa(row) },
      'Funding account refreshed'
    ).send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    return next(toCustomerSafeError(error, 'Failed to refresh funding account'));
  }
};
