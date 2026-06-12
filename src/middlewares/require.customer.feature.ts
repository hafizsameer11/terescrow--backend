import { Request, Response, NextFunction } from 'express';
import { UserRoles } from '@prisma/client';
import ApiError from '../utils/ApiError';
import {
  forbiddenMessageForRestrictions,
  getCustomerRestrictions,
} from '../utils/customer.restrictions';

export function requireCustomerFeature(feature: string, featureLabel: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user || req.body._user;
      if (!user || user.role !== UserRoles.customer) {
        return next();
      }

      const restrictions = await getCustomerRestrictions(user.id);
      const message = forbiddenMessageForRestrictions(restrictions, feature, featureLabel);
      if (message) {
        return next(ApiError.forbidden(message));
      }

      return next();
    } catch (error) {
      return next(ApiError.internal('Failed to verify account restrictions'));
    }
  };
}
