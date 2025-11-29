/**
 * Gift Card Admin Controller
 * 
 * Handles admin operations:
 * - Sync products from Reloadly
 * - Upload custom images
 * - View sync logs
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { giftCardProductSyncService } from '../../services/giftcard/giftcard.product.sync.service';
import { reloadlyAuthService } from '../../services/reloadly/reloadly.auth.service';

/**
 * Sync products from Reloadly
 */
export const syncProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { syncType = 'manual' } = req.body;

    if (!['full', 'incremental', 'manual'].includes(syncType)) {
      throw ApiError.badRequest('Invalid sync type. Must be: full, incremental, or manual');
    }

    // Start sync (async)
    giftCardProductSyncService.syncAllProducts(syncType as 'full' | 'incremental' | 'manual')
      .then((result) => {
        console.log('Product sync completed:', result);
      })
      .catch((error) => {
        console.error('Product sync failed:', error);
      });

    return new ApiResponse(200, {
      message: 'Product sync started',
      syncType,
    }, 'Sync initiated successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to start product sync'));
  }
};

/**
 * Get sync logs
 */
export const getSyncLogsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const [logs, total] = await Promise.all([
      prisma.giftCardProductSyncLog.findMany({
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.giftCardProductSyncLog.count(),
    ]);

    return new ApiResponse(200, {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    }, 'Sync logs retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch sync logs'));
  }
};

/**
 * Upload custom image for product (only if Reloadly image is missing)
 */
export const uploadProductImageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId } = req.params;
    const file = req.file;

    if (!file) {
      throw ApiError.badRequest('Image file is required');
    }

    // Get product
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: parseInt(productId, 10) },
          { reloadlyProductId: parseInt(productId, 10) },
        ],
      },
    });

    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    // Only allow upload if Reloadly image is missing
    if (product.reloadlyImageUrl) {
      throw ApiError.badRequest(
        'Product already has a Reloadly image. Custom images are only allowed when Reloadly image is missing.'
      );
    }

    // TODO: Upload to cloud storage (Cloudinary, S3, etc.)
    // For now, we'll just store the file path
    const imageUrl = `/uploads/giftcards/${file.filename}`;

    // Update product
    const updatedProduct = await prisma.giftCardProduct.update({
      where: { id: product.id },
      data: {
        imageUrl,
        updatedAt: new Date(),
      },
    });

    return new ApiResponse(200, {
      productId: updatedProduct.reloadlyProductId,
      imageUrl: updatedProduct.imageUrl,
    }, 'Image uploaded successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to upload image'));
  }
};

/**
 * Get Reloadly token status
 */
export const getReloadlyTokenStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const tokenInfo = await reloadlyAuthService.getTokenInfo();

    return new ApiResponse(200, tokenInfo, 'Token status retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to get token status'));
  }
};

/**
 * Refresh Reloadly token
 */
export const refreshReloadlyTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = await reloadlyAuthService.refreshToken();
    const tokenInfo = await reloadlyAuthService.getTokenInfo();

    return new ApiResponse(200, {
      message: 'Token refreshed successfully',
      expiresAt: tokenInfo.expiresAt,
    }, 'Token refreshed successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to refresh token'));
  }
};

