import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

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

    let userWithCode = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });

    if (!userWithCode) {
      return next(ApiError.notFound('User not found'));
    }

    if (!userWithCode.referralCode) {
      let newCode: string;
      let isUnique = false;

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
 * Get referral statistics with real earnings data
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

    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (!userData) {
      return next(ApiError.notFound('User not found'));
    }

    const referralCount = await prisma.user.count({
      where: { referredBy: userId },
    });

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
      take: 100,
    });

    const wallet = await prisma.referralWallet.findUnique({
      where: { userId },
    });

    const earningsAgg = await prisma.referralEarning.groupBy({
      by: ['earningType', 'level'],
      where: { userId },
      _sum: { earnedAmount: true },
    });

    let level1Earnings = new Decimal(0);
    let level2Earnings = new Decimal(0);
    let signupBonuses = new Decimal(0);

    for (const row of earningsAgg) {
      const sum = row._sum.earnedAmount || new Decimal(0);
      if (row.earningType === 'SIGNUP_BONUS') {
        signupBonuses = signupBonuses.plus(sum);
      } else if (row.level === 1) {
        level1Earnings = level1Earnings.plus(sum);
      } else if (row.level === 2) {
        level2Earnings = level2Earnings.plus(sum);
      }
    }

    const totalEarnings = level1Earnings.plus(level2Earnings).plus(signupBonuses);

    return new ApiResponse(
      200,
      {
        referralCode: userData.referralCode || null,
        totalReferrals: referralCount,
        earnings: {
          totalEarningsNaira: Number(totalEarnings),
          level1Earnings: Number(level1Earnings),
          level2Earnings: Number(level2Earnings),
          signupBonuses: Number(signupBonuses),
          walletBalance: wallet ? Number(wallet.balance) : 0,
          hasWithdrawn: wallet?.hasWithdrawn ?? false,
        },
        referredUsers,
      },
      'Referral statistics retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Get referral stats error:', error);
    return next(ApiError.internal(error.message || 'Failed to get referral statistics'));
  }
};

/**
 * Get referral earning history
 * GET /api/v2/referrals/earnings?page=1&limit=20
 */
export const getReferralEarningsController = async (
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

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [earnings, total] = await Promise.all([
      prisma.referralEarning.findMany({
        where: { userId },
        include: {
          sourceUser: {
            select: { id: true, firstname: true, lastname: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referralEarning.count({ where: { userId } }),
    ]);

    return new ApiResponse(
      200,
      {
        earnings: earnings.map((e) => ({
          id: e.id,
          level: e.level,
          service: e.service,
          earningType: e.earningType,
          tradeAmountNaira: e.tradeAmountNaira ? Number(e.tradeAmountNaira) : null,
          earnedAmount: Number(e.earnedAmount),
          sourceUser: e.sourceUser
            ? `${e.sourceUser.firstname} ${e.sourceUser.lastname}`.trim()
            : null,
          createdAt: e.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      'Referral earnings retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Get referral earnings error:', error);
    return next(ApiError.internal(error.message || 'Failed to get referral earnings'));
  }
};

/**
 * Withdraw from referral wallet to main fiat wallet
 * POST /api/v2/referrals/withdraw
 * Body: { amount: number }
 */
export const withdrawReferralController = async (
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

    const { amount } = req.body;
    const withdrawAmount = new Decimal(amount || 0);

    if (withdrawAmount.lte(0)) {
      return next(ApiError.badRequest('Withdrawal amount must be greater than 0'));
    }

    const wallet = await prisma.referralWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return next(ApiError.badRequest('No referral wallet found'));
    }

    if (new Decimal(wallet.balance.toString()).lt(withdrawAmount)) {
      return next(ApiError.badRequest('Insufficient referral wallet balance'));
    }

    // First withdrawal must meet minimum threshold
    if (!wallet.hasWithdrawn) {
      const setting = await prisma.referralCommissionSetting.findFirst({
        where: { isActive: true },
        select: { minFirstWithdrawal: true },
      });
      const minAmount = setting
        ? new Decimal(setting.minFirstWithdrawal.toString())
        : new Decimal('20000');

      if (new Decimal(wallet.balance.toString()).lt(minAmount)) {
        return next(
          ApiError.badRequest(
            `First withdrawal requires a minimum balance of ₦${minAmount.toString()}`
          )
        );
      }
    }

    // Find the user's NGN fiat wallet
    const fiatWallet = await prisma.fiatWallet.findFirst({
      where: { userId, currency: 'NGN' },
    });

    if (!fiatWallet) {
      return next(ApiError.badRequest('No NGN fiat wallet found'));
    }

    await prisma.$transaction(async (tx) => {
      await tx.referralWallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: withdrawAmount },
          hasWithdrawn: true,
        },
      });

      await tx.fiatWallet.update({
        where: { id: fiatWallet.id },
        data: { balance: { increment: withdrawAmount } },
      });

      await tx.referralWithdrawal.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: withdrawAmount,
          fiatWalletId: fiatWallet.id,
          status: 'completed',
        },
      });
    });

    return new ApiResponse(
      200,
      { withdrawnAmount: Number(withdrawAmount) },
      'Withdrawal successful'
    ).send(res);
  } catch (error: any) {
    console.error('Referral withdrawal error:', error);
    return next(ApiError.internal(error.message || 'Withdrawal failed'));
  }
};
