import { Request, Response, NextFunction } from 'express';
import { UserRoles } from '@prisma/client';
import ApiError from '../utils/ApiError';
import { verifyToken } from '../utils/authUtils';
import { BANNED_CUSTOMER_MESSAGE, isUserBanned } from '../utils/customer.restrictions';
import { prisma } from '../utils/prisma';
import { v1Compat } from '../config/v1.compat.config';

/**
 * Blocks banned customers on any customer-facing API call, even when a stale JWT is still stored.
 * Skips requests with no token (public endpoints). Invalid tokens are left to authenticateUser.
 */
export async function rejectBannedCustomer(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!v1Compat.enableBannedCustomerChecks) {
    return next();
  }

  try {
    const token =
      (req.cookies?.token as string | undefined) ||
      (req.headers.authorization?.split(' ')[1] as string | undefined);

    if (!token) {
      return next();
    }

    const decoded = await verifyToken(token);
    if (!decoded?.id) {
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { role: true, status: true },
    });

    if (user?.role === UserRoles.customer && isUserBanned(user.status)) {
      return next(ApiError.forbidden(BANNED_CUSTOMER_MESSAGE));
    }

    return next();
  } catch {
    return next();
  }
}

export default rejectBannedCustomer;
