/**
 * Gift Card Purchase Controller
 *
 * Buy gift cards is temporarily under maintenance.
 * Full purchase implementation is preserved in git history and can be restored
 * when the feature is re-enabled. Sell gift card flow is unaffected.
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import {
  FEATURE_GIFT_CARD,
  forbiddenMessageForRestrictions,
  getCustomerRestrictions,
} from '../../utils/customer.restrictions';

/**
 * Process gift card purchase
 * POST /api/v2/giftcards/purchase
 */
export const purchaseController = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body?._user;
    if (user?.id) {
      const restrictions = await getCustomerRestrictions(Number(user.id));
      const frozen = forbiddenMessageForRestrictions(
        restrictions,
        FEATURE_GIFT_CARD,
        'Gift card purchase'
      );
      if (frozen) return next(ApiError.forbidden(frozen));
    }
  } catch (_) {
    /* fall through to maintenance message */
  }
  return next(
    ApiError.forbidden(
      'Buy gift cards is temporarily under maintenance. Please try again later.'
    )
  );
};
