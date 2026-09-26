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
import {
  namesAreTotallyDifferent,
  verifyBvnBasicOnly,
} from '../../services/prembly/prembly.kyc.service';
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
 * Body: { bvn, acceptBvnName?: boolean }
 *
 * 1) Prembly BVN basic check (valid BVN only — no Prembly name match required)
 * 2) Always use BVN name for PalmPay VA
 * 3) If BVN name is totally different from app profile → return needsNameUpdate
 *    (client can resubmit with acceptBvnName: true to update profile + create)
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

    const acceptBvnName =
      req.body?.acceptBvnName === true ||
      req.body?.acceptBvnName === 'true' ||
      req.body?.acceptBvnName === 1 ||
      req.body?.acceptBvnName === '1';

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        firstname: true,
        lastname: true,
        email: true,
        phoneNumber: true,
      },
    });

    const appFirst = String(profile?.firstname || user.firstname || '').trim();
    const appLast = String(profile?.lastname || user.lastname || '').trim();
    const appFullName = `${appFirst} ${appLast}`.trim();

    const verified = await verifyBvnBasicOnly(bvn);
    const nameMismatch = namesAreTotallyDifferent(
      appFirst,
      appLast,
      verified.fullName
    );

    if (nameMismatch && !acceptBvnName) {
      return new ApiResponse(
        200,
        {
          needsNameUpdate: true,
          bvnFullName: verified.fullName,
          suggestedFirstName: verified.suggestedFirstName,
          suggestedLastName: verified.suggestedLastName,
          appFullName: appFullName || null,
          virtualAccount: null,
        },
        'BVN verified. Your profile name does not match your BVN name. Please update your name to continue.'
      ).send(res);
    }

    if (nameMismatch && acceptBvnName) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstname: verified.suggestedFirstName,
          lastname: verified.suggestedLastName,
        },
      });
    }

    // Always send BVN-verified name to PalmPay
    const row = await createPersonalPermanentVa({
      userId: user.id,
      bvn,
      email: profile?.email || user.email,
      phone: profile?.phoneNumber || user.phoneNumber,
      firstName: verified.suggestedFirstName,
      lastName: verified.suggestedLastName,
    });

    return new ApiResponse(
      200,
      {
        needsNameUpdate: false,
        virtualAccount: serializePermanentVa(row),
        bvnFullName: verified.fullName,
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
