import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

const freezeModel = (prisma as any).userFeatureFreeze;

const ALLOWED_FEATURES = [
  'deposit',
  'withdrawal',
  'send/receive/swap/buy/sell crypto',
  'buy/sell gift card',
];

function normalizeFeature(f: string): string {
  return f.toLowerCase().trim();
}

export async function postFreezeController(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customer id'));
    let { feature } = req.body;
    if (!feature || typeof feature !== 'string') return next(ApiError.badRequest('feature is required'));
    feature = normalizeFeature(feature);
    if (!ALLOWED_FEATURES.includes(feature)) {
      return next(ApiError.badRequest(`feature must be one of: ${ALLOWED_FEATURES.join(', ')}`));
    }
    const user = await prisma.user.findUnique({ where: { id: customerId } });
    if (!user) return next(ApiError.notFound('Customer not found'));
    await freezeModel.upsert({
      where: { userId_feature: { userId: customerId, feature } },
      create: { userId: customerId, feature },
      update: {},
    });
    const freezes = await freezeModel.findMany({ where: { userId: customerId } });
    return new ApiResponse(200, { frozenFeatures: freezes.map((f: any) => f.feature) }, 'Feature frozen').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to freeze feature'));
  }
}

export async function postUnfreezeController(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) return next(ApiError.badRequest('Invalid customer id'));
    let { feature } = req.body;
    if (!feature || typeof feature !== 'string') return next(ApiError.badRequest('feature is required'));
    feature = normalizeFeature(feature);
    await freezeModel.deleteMany({
      where: { userId: customerId, feature },
    });
    const freezes = await freezeModel.findMany({ where: { userId: customerId } });
    return new ApiResponse(200, { frozenFeatures: freezes.map((f: any) => f.feature) }, 'Feature unfrozen').send(res);
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
