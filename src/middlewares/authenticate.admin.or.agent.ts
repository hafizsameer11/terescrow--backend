import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import { UserRoles } from '@prisma/client';

/**
 * Requires admin or agent (operations staff). Must run after authenticateUser.
 */
export const authenticateAdminOrAgent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    if (!user) {
      throw ApiError.unauthorized('You are not logged in');
    }
    if (user.role !== UserRoles.admin && user.role !== UserRoles.agent) {
      throw ApiError.unauthorized('Admin or agent access required');
    }
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Something went wrong'));
  }
};

export default authenticateAdminOrAgent;
