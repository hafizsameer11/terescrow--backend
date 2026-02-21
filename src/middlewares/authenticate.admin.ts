import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import { UserRoles } from '@prisma/client';

/**
 * Requires the authenticated user to have role admin.
 * Must be used after authenticateUser.
 */
const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user) {
      throw ApiError.unauthorized('You are not logged in');
    }
    if (user.role !== UserRoles.admin) {
      throw ApiError.unauthorized('Admin access required');
    }
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Something went wrong'));
  }
};

/**
 * Requires the authenticated user to be admin or auditor.
 * Since there is no auditor role in UserRoles, this currently allows admin only.
 * Can be extended to allow a customRole named "auditor" if needed.
 * Must be used after authenticateUser.
 */
const requireAdminOrAuditor = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user) {
      throw ApiError.unauthorized('You are not logged in');
    }
    if (user.role !== UserRoles.admin) {
      // Optionally allow customRole for auditor in the future
      throw ApiError.unauthorized('Admin or auditor access required');
    }
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Something went wrong'));
  }
};

export default authenticateAdmin;
export { requireAdminOrAuditor };
