/**
 * User Wallet Controller
 * 
 * Handles user wallet export and key retrieval
 */

import { Request, Response, NextFunction } from 'express';
import userWalletService from '../../services/user/user.wallet.service';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Export user's wallet (mnemonic + addresses)
 * Requires PIN verification
 */
export const exportUserWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;
    const { blockchain, pin } = req.body;

    if (!blockchain) {
      return next(ApiError.badRequest('Blockchain is required'));
    }

    if (!pin) {
      return next(ApiError.badRequest('PIN is required'));
    }

    // Verify PIN
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pin: true },
    });

    if (!user || !user.pin || user.pin !== pin) {
      return next(ApiError.badRequest('Invalid PIN'));
    }

    // Export wallet
    const walletData = await userWalletService.exportUserWallet(userId, blockchain);

    return new ApiResponse(
      200,
      {
        ...walletData,
        warning: 'Keep your mnemonic safe and never share it with anyone. Anyone with your mnemonic can access your funds.',
      },
      'Wallet exported successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in exportUserWalletController:', error);
    if (error.message.includes('not found')) {
      return next(ApiError.notFound(error.message));
    }
    return next(ApiError.internal(error.message || 'Failed to export wallet'));
  }
};

/**
 * Get user's private key for a specific address
 * Requires PIN verification
 */
export const exportPrivateKeyController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;
    const { addressId, pin } = req.body;

    if (!addressId) {
      return next(ApiError.badRequest('Address ID is required'));
    }

    if (!pin) {
      return next(ApiError.badRequest('PIN is required'));
    }

    // Verify PIN
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pin: true },
    });

    if (!user || !user.pin || user.pin !== pin) {
      return next(ApiError.badRequest('Invalid PIN'));
    }

    // Get deposit address and verify it belongs to user
    const depositAddress = await prisma.depositAddress.findFirst({
      where: {
        id: parseInt(addressId),
        virtualAccount: {
          userId,
        },
      },
      include: {
        virtualAccount: {
          select: {
            currency: true,
            blockchain: true,
          },
        },
      },
    });

    if (!depositAddress) {
      return next(ApiError.notFound('Address not found or does not belong to you'));
    }

    if (!depositAddress.privateKey) {
      return next(ApiError.notFound('Private key not available for this address'));
    }

    // Decrypt private key
    const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
    const parts = depositAddress.privateKey.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    // @ts-ignore
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return new ApiResponse(
      200,
      {
        address: depositAddress.address,
        privateKey: decrypted,
        blockchain: depositAddress.blockchain,
        currency: depositAddress.currency,
        warning: 'Keep your private key safe and never share it with anyone. Anyone with your private key can access funds in this address.',
      },
      'Private key exported successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in exportPrivateKeyController:', error);
    return next(ApiError.internal(error.message || 'Failed to export private key'));
  }
};

/**
 * Get all user wallets (list only, no sensitive data)
 */
export const getUserWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;

    // Get all user wallets (without sensitive data)
    const wallets = await userWalletService.getUserWallets(userId);

    // Get address counts for each wallet
    const walletsWithInfo = await Promise.all(
      wallets.map(async (wallet) => {
        const addressCount = await prisma.depositAddress.count({
          where: {
            userWalletId: wallet.id,
          },
        });

        return {
          id: wallet.id,
          blockchain: wallet.blockchain,
          derivationPath: wallet.derivationPath,
          addressCount,
          createdAt: wallet.createdAt,
          // Do not include mnemonic or xpub in list
        };
      })
    );

    return new ApiResponse(
      200,
      { wallets: walletsWithInfo },
      'User wallets retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getUserWalletsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve wallets'));
  }
};

/**
 * Generic wallet generation controller
 * Generates wallet for a specific blockchain for user (if doesn't exist)
 */
const generateWalletForBlockchain = async (
  req: Request,
  res: Response,
  next: NextFunction,
  blockchain: string,
  blockchainAliases: string[] = []
) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return next(ApiError.badRequest('userId parameter is required'));
    }

    const userIdNum = parseInt(userId as string, 10);
    if (isNaN(userIdNum) || userIdNum <= 0) {
      return next(ApiError.badRequest('Invalid userId. Must be a positive integer'));
    }

    // Check if wallet already exists
    const existingWallet = await userWalletService.getUserWallet(userIdNum, blockchain);
    if (existingWallet) {
      return new ApiResponse(
        200,
        {
          wallet: {
            id: existingWallet.id,
            blockchain: existingWallet.blockchain,
            address: existingWallet.xpub, // For non-xpub blockchains, address is stored in xpub field
            createdAt: existingWallet.createdAt,
          },
          message: `${blockchain} wallet already exists`,
        },
        `${blockchain} wallet already exists`
      ).send(res);
    }

    // Generate wallet
    const wallet = await userWalletService.getOrCreateUserWallet(userIdNum, blockchain);

    // Get virtual accounts for this blockchain
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId: userIdNum,
        blockchain: { in: [blockchain, ...blockchainAliases] },
      },
    });

    // Generate deposit addresses for virtual accounts
    const depositAddressService = (await import('../../services/tatum/deposit.address.service')).default;
    const createdAddresses = [];

    for (const virtualAccount of virtualAccounts) {
      try {
        // Check if deposit address already exists
        const existingAddress = await prisma.depositAddress.findFirst({
          where: {
            virtualAccountId: virtualAccount.id,
            userWalletId: wallet.id,
          },
        });

        if (existingAddress) {
          console.log(`Deposit address already exists for virtual account ${virtualAccount.id}`);
          createdAddresses.push({
            virtualAccountId: virtualAccount.id,
            currency: virtualAccount.currency,
            address: existingAddress.address,
            status: 'existing',
          });
          continue;
        }

        // Generate deposit address
        const depositAddress = await depositAddressService.generateAndAssignToVirtualAccount(virtualAccount.id);
        createdAddresses.push({
          virtualAccountId: virtualAccount.id,
          currency: virtualAccount.currency,
          address: depositAddress.address,
          status: 'created',
        });
      } catch (error: any) {
        console.error(`Error generating deposit address for virtual account ${virtualAccount.id}:`, error.message);
        createdAddresses.push({
          virtualAccountId: virtualAccount.id,
          currency: virtualAccount.currency,
          error: error.message,
          status: 'failed',
        });
      }
    }

    return new ApiResponse(
      200,
      {
        wallet: {
          id: wallet.id,
          blockchain: wallet.blockchain,
          address: wallet.xpub, // For non-xpub blockchains, address is stored in xpub field
          createdAt: wallet.createdAt,
        },
        depositAddresses: createdAddresses,
      },
      `${blockchain} wallet generated successfully`
    ).send(res);
  } catch (error: any) {
    console.error(`Error in generateWalletForBlockchain (${blockchain}):`, error);
    return next(ApiError.internal(error.message || `Failed to generate ${blockchain} wallet`));
  }
};

/**
 * Generate Solana wallet for user (if doesn't exist)
 * This endpoint helps fix users who don't have Solana wallet yet
 */
export const generateSolanaWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return generateWalletForBlockchain(req, res, next, 'solana', ['sol']);
};

/**
 * Generate Polygon wallet for user (if doesn't exist)
 */
export const generatePolygonWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return generateWalletForBlockchain(req, res, next, 'polygon', ['matic']);
};

/**
 * Generate Dogecoin wallet for user (if doesn't exist)
 */
export const generateDogecoinWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return generateWalletForBlockchain(req, res, next, 'dogecoin', ['doge']);
};

/**
 * Generate XRP wallet for user (if doesn't exist)
 */
export const generateXrpWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return generateWalletForBlockchain(req, res, next, 'xrp', ['ripple']);
};

