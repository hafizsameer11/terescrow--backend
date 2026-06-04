import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { getUserBalances, getUserBalancesSummary, getUserAssetBalances, getUserWalletDetail } from '../../services/admin/user.balances.service';
import { transferOnChainSurplus } from '../../services/admin/surplus.onchain.transfer.service';

export async function getAdminUserBalancesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const result = await getUserBalances({
      sort: req.query.sort as string | undefined,
      balanceCurrency: req.query.balanceCurrency as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      dateRange: req.query.dateRange as string | undefined,
      search: req.query.search as string | undefined,
      page: isNaN(page as number) ? undefined : page,
      limit: isNaN(limit as number) ? undefined : limit,
    });
    return new ApiResponse(200, result, 'User balances retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch user balances'));
  }
}

export async function getAdminUserAssetBalancesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = parseInt(String(req.params.userId), 10);
    if (!Number.isFinite(userId)) {
      return next(ApiError.badRequest('Invalid user id'));
    }
    const assets = await getUserAssetBalances(userId);
    return new ApiResponse(200, { assets }, 'User asset balances retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch user asset balances'));
  }
}

export async function getAdminUserWalletDetailController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = parseInt(String(req.params.userId), 10);
    if (!Number.isFinite(userId)) {
      return next(ApiError.badRequest('Invalid user id'));
    }
    const detail = await getUserWalletDetail(userId);
    if (!detail) return next(ApiError.notFound('User not found'));
    return new ApiResponse(200, detail, 'User wallet detail retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch user wallet detail'));
  }
}

export async function transferOnChainSurplusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = parseInt(String(req.params.userId), 10);
    if (!Number.isFinite(userId)) {
      return next(ApiError.badRequest('Invalid user id'));
    }
    const adminUser = (req as { user?: { id?: number } }).user;
    if (!adminUser?.id) return next(ApiError.unauthorized('Authentication required'));

    const { currency, blockchain, toAddress, amount } = req.body ?? {};
    if (!currency || !blockchain) {
      return next(ApiError.badRequest('currency and blockchain are required'));
    }
    const result = await transferOnChainSurplus({
      userId,
      adminUserId: adminUser.id,
      currency: String(currency),
      blockchain: String(blockchain),
      toAddress: String(toAddress ?? ''),
      amount: amount != null ? String(amount) : undefined,
    });
    return new ApiResponse(200, result, 'Surplus transferred on-chain and recorded').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal(error instanceof Error ? error.message : 'Failed to transfer surplus'));
  }
}

export async function getAdminUserBalancesSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const summary = await getUserBalancesSummary();
    return new ApiResponse(200, summary, 'User balances summary retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch user balances summary'));
  }
}
