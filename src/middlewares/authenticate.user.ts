import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import { verifyToken } from '../utils/authUtils';
import { prisma } from '../utils/prisma';

const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      (req.cookies.token as string) ||
      (req.headers.authorization?.split(' ')[1] as string);

    if (!token) {
      throw ApiError.unauthorized('You are not logged in');
    }

    const decoded = await verifyToken(token);
    // console.log(decoded);
    if (!decoded) {
      throw ApiError.unauthorized('You are not logged in');
    }
    // console.log(decoded);
    const isUser = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
    });

    if (!isUser) {
      throw ApiError.unauthorized('You are not logged in');
    }

    // Store user in both req.user (standard Express practice) and req.body._user (for backward compatibility)
    (req as any).user = isUser;
    req.body._user = isUser;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.internal('Something went wrong'));
  }
};

export default authenticateUser;
