import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

const ALLOWED_FEATURES = [
  'Deposit',
  'Withdrawal',
  'Send/Receive/Swap/Buy/Sell Crypto',
  'Buy/Sell Gift Card',
];

export async function postFreezeController(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customer id'));
    const { feature } = req.body;
    if (!feature || typeof feature !== 'string') return next(ApiError.badRequest('feature is required'));
    if (!ALLOWED_FEATURES.includes(feature)) {
      return next(ApiError.badRequest(`feature must be one of: ${ALLOWED_FEATURES.join(', ')}`));
    }
    const user = await prisma.user.findUnique({ where: { id: customerId } });
    if (!user) return next(ApiError.notFound('Customer not found'));
    await prisma.userFeatureFreeze.upsert({
      where: { userId_feature: { userId: customerId, feature } },
      create: { userId: customerId, feature },
      update: {},
    });
    const freezes = await prisma.userFeatureFreeze.findMany({ where: { userId: customerId } });
    return new ApiResponse(200, { frozenFeatures: freezes.map((f) => f.feature) }, 'Feature frozen').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to freeze feature'));
  }
}

export async function postUnfreezeController(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customer id'));
    const { feature } = req.body;
    if (!feature || typeof feature !== 'string') return next(ApiError.badRequest('feature is required'));
    await prisma.userFeatureFreeze.deleteMany({
      where: { userId: customerId, feature },
    });
    const freezes = await prisma.userFeatureFreeze.findMany({ where: { userId: customerId } });
    return new ApiResponse(200, { frozenFeatures: freezes.map((f) => f.feature) }, 'Feature unfrozen').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to unfreeze feature'));
  }
}

export async function postBanController(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customer id'));
    const { reason, permanent } = req.body;
    const user = await prisma.user.findUnique({ where: { id: customerId } });
    if (!user) return next(ApiError.notFound('Customer not found'));
    await prisma.user.update({
      where: { id: customerId },
      data: { status: 'banned' },
    });
    if (reason) {
      await prisma.accountActivity.create({
        data: {
          userId: customerId,
          description: `Account banned. Reason: ${reason}. Permanent: ${permanent ?? false}`,
        },
      });
    }
    return new ApiResponse(200, { status: 'banned' }, 'Customer banned').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to ban customer'));
  }
}
