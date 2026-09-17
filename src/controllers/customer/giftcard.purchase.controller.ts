/**
 * Gift Card Purchase Controller
 *
 * Buy gift cards is temporarily under maintenance.
 * Full purchase implementation is preserved in git history and can be restored
 * when the feature is re-enabled. Sell gift card flow is unaffected.
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';

/**
 * Process gift card purchase
 * POST /api/v2/giftcards/purchase
 */
export const purchaseController = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  return next(
    ApiError.forbidden(
      'Buy gift cards is temporarily under maintenance. Please try again later.'
    )
  );
};
