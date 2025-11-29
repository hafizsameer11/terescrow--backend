/**
 * Master Wallet Controller
 * 
 * Handles master wallet creation and management
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import masterWalletService from '../../services/tatum/master.wallet.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Create a new master wallet
 * POST /api/admin/master-wallet
 */
export const createMasterWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    const { blockchain, endpoint } = req.body;

    if (!blockchain || !endpoint) {
      throw ApiError.badRequest('Blockchain and endpoint are required');
    }

    const wallet = await masterWalletService.createMasterWallet(blockchain, endpoint);

    return new ApiResponse(201, { wallet }, 'Master wallet created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to create master wallet'));
  }
};

/**
 * Get all master wallets
 * GET /api/admin/master-wallet
 */
export const getAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const wallets = await masterWalletService.getAllMasterWallets();

    // Remove sensitive data before sending
    const safeWallets = wallets.map((wallet) => ({
      id: wallet.id,
      blockchain: wallet.blockchain,
      address: wallet.address,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    }));

    return new ApiResponse(200, { wallets: safeWallets }, 'Master wallets retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve master wallets'));
  }
};

