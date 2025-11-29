import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';

/**
 * Get wallet overview
 * GET /api/v2/wallets/overview
 */
export const getWalletOverviewController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const overview = await fiatWalletService.getWalletOverview(user.id);

    return res.status(200).json(
      new ApiResponse(200, overview, 'Wallet overview retrieved successfully')
    );
  } catch (error: any) {
    console.error('Get wallet overview error:', error);
    return next(ApiError.internal(error.message || 'Failed to get wallet overview'));
  }
};

/**
 * Get wallet transactions
 * GET /api/v2/wallets/transactions
 */
export const getWalletTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { currency, type, status, page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      userId: user.id,
    };

    if (currency) {
      where.currency = (currency as string).toUpperCase();
    }

    if (type) {
      where.type = (type as string).toUpperCase();
    }

    if (status) {
      where.status = (status as string).toLowerCase();
    }

    const [transactions, total] = await Promise.all([
      require('../../utils/prisma').prisma.fiatTransaction.findMany({
        where,
        include: {
          wallet: {
            select: {
              id: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      require('../../utils/prisma').prisma.fiatTransaction.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      }, 'Transactions retrieved successfully')
    );
  } catch (error: any) {
    console.error('Get wallet transactions error:', error);
    return next(ApiError.internal(error.message || 'Failed to get transactions'));
  }
};

