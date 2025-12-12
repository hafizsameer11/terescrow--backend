import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';

/**
 * Generate a unique referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get or generate referral code for user
 * GET /api/v2/referrals/code
 */
export const getReferralCodeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    // Get user with referral code
    let userWithCode = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });

    if (!userWithCode) {
      return next(ApiError.notFound('User not found'));
    }

    // Generate referral code if user doesn't have one
    if (!userWithCode.referralCode) {
      let newCode: string;
      let isUnique = false;

      // Ensure code is unique
      while (!isUnique) {
        newCode = generateReferralCode();
        const existing = await prisma.user.findUnique({
          where: { referralCode: newCode },
          select: { id: true },
        });
        if (!existing) {
          isUnique = true;
        }
      }

      // Update user with referral code
      userWithCode = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: newCode! },
        select: { id: true, referralCode: true },
      });
    }

    return new ApiResponse(
      200,
      { referralCode: userWithCode.referralCode },
      'Referral code retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Get referral code error:', error);
    return next(ApiError.internal(error.message || 'Failed to get referral code'));
  }
};

/**
 * Get referral statistics
 * GET /api/v2/referrals/stats
 */
export const getReferralStatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    // Get user's referral code
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (!userData) {
      return next(ApiError.notFound('User not found'));
    }

    // Count users referred by this user
    const referralCount = await prisma.user.count({
      where: { referredBy: userId },
    });

    // Get list of referred users (optional, you might want to paginate this)
    const referredUsers = await prisma.user.findMany({
      where: { referredBy: userId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to recent 100
    });

    return new ApiResponse(
      200,
      {
        referralCode: userData.referralCode || null,
        totalReferrals: referralCount,
        referredUsers,
      },
      'Referral statistics retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Get referral stats error:', error);
    return next(ApiError.internal(error.message || 'Failed to get referral statistics'));
  }
};

