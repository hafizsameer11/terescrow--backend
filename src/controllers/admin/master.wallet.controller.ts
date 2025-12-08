/**
 * Master Wallet Controller
 * 
 * Handles master wallet creation and management
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import masterWalletService from '../../services/tatum/master.wallet.service';
import tatumService from '../../services/tatum/tatum.service';
import depositAddressService from '../../services/tatum/deposit.address.service';
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

/**
 * Create master wallets for all supported blockchains
 * POST /api/admin/master-wallet/create-all
 */
export const createAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await masterWalletService.createAllMasterWallets();

    // Remove sensitive data from results
    const safeResults = result.results.map((item: any) => ({
      blockchain: item.blockchain,
      status: item.status,
      wallet: item.wallet
        ? {
            id: item.wallet.id,
            blockchain: item.wallet.blockchain,
            address: item.wallet.address,
            createdAt: item.wallet.createdAt,
            updatedAt: item.wallet.updatedAt,
          }
        : null,
    }));

    return new ApiResponse(200, {
      summary: {
        created: result.success,
        existing: result.existing,
        errorCount: result.errorCount,
      },
      results: safeResults,
      errors: result.errors,
    }, 'Master wallets creation completed').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to create master wallets'));
  }
};

/**
 * Update all existing master wallets with missing address and private key
 * POST /api/admin/master-wallet/update-all
 */
export const updateAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await masterWalletService.updateAllMasterWallets();

    // Remove sensitive data from results
    const safeResults = result.results.map((item: any) => ({
      blockchain: item.blockchain,
      status: item.status,
      wallet: item.wallet
        ? {
            id: item.wallet.id,
            blockchain: item.wallet.blockchain,
            address: item.wallet.address,
            createdAt: item.wallet.createdAt,
            updatedAt: item.wallet.updatedAt,
          }
        : null,
      error: item.error || undefined,
    }));

    return new ApiResponse(200, {
      summary: {
        total: result.total,
        updated: result.updated,
        errors: result.errors,
      },
      results: safeResults,
    }, 'Master wallets update completed').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to update master wallets'));
  }
};

/**
 * Get balances for all master wallets
 * GET /api/admin/master-wallet/balances
 */
export const getMasterWalletsBalancesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const wallets = await masterWalletService.getAllMasterWallets();

    // Get balance for each master wallet address using Tatum
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        let balance = null;
        let error = null;

        if (wallet.address) {
          try {
            // Get only native balance, no tokens for master wallets
            balance = await tatumService.getAddressBalance(wallet.blockchain, wallet.address, false);
          } catch (err: any) {
            error = err.message || 'Failed to get balance';
            console.error(`Error getting balance for ${wallet.blockchain}:`, error);
          }
        }

        return {
          id: wallet.id,
          blockchain: wallet.blockchain,
          address: wallet.address,
          balance: balance || null,
          error: error || null,
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        };
      })
    );

    return new ApiResponse(
      200,
      { wallets: walletsWithBalances },
      'Master wallet balances retrieved successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve master wallet balances'));
  }
};

/**
 * Get deposit address for a user
 * GET /api/admin/master-wallet/deposit-address/:userId/:currency/:blockchain
 */
export const getDepositAddressController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = parseInt(req.params.userId);
    const { currency, blockchain } = req.params;

    if (isNaN(userId)) {
      return next(ApiError.badRequest('Invalid user ID'));
    }

    if (!currency || !blockchain) {
      return next(ApiError.badRequest('Currency and blockchain are required'));
    }

    const depositAddress = await depositAddressService.getDepositAddress(
      userId,
      currency,
      blockchain
    );

    return new ApiResponse(
      200,
      { depositAddress },
      'Deposit address retrieved successfully'
    ).send(res);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return next(ApiError.notFound(error.message));
    }
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal(error.message || 'Failed to retrieve deposit address'));
  }
};

