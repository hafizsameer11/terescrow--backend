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
  fullNamesCompatible,
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
 * Body: { bvn, bvnFullName }
 *
 * 1) User enters BVN + full name as on BVN
 * 2) Prembly validates BVN exists
 * 3) Entered name must match Prembly BVN name (smooth)
 * 4) Prembly BVN name must match app profile (else: use your own BVN — never rewrite profile)
 * 5) Always create PalmPay VA with Prembly BVN name as account name
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

    const enteredBvnName = String(
      req.body?.bvnFullName || req.body?.fullName || req.body?.accountName || ''
    )
      .trim()
      .replace(/\s+/g, ' ');
    if (enteredBvnName.length < 3) {
      return next(
        ApiError.badRequest('Enter the full name exactly as it appears on your BVN')
      );
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

    const appFirst = String(profile?.firstname || user.firstname || '').trim();
    const appLast = String(profile?.lastname || user.lastname || '').trim();

    const verified = await verifyBvnBasicOnly(bvn);

    // Entered name must match Prembly record for this BVN
    if (!fullNamesCompatible(enteredBvnName, verified.fullName)) {
      return next(
        ApiError.badRequest(
          'The name you entered does not match this BVN. Enter the full name on your BVN and try again.'
        )
      );
    }

    // Profile name must belong to the same person — block borrowed BVNs
    if (namesAreTotallyDifferent(appFirst, appLast, verified.fullName)) {
      return next(
        ApiError.badRequest(
          'This BVN does not match the name on your Tercescrow profile. Please use your own BVN.'
        )
      );
    }

    // Always use official BVN name as PalmPay account name
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
