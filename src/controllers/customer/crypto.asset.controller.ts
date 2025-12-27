/**
 * Crypto Asset Controller
 * 
 * Handles user crypto asset endpoints
 */

import { Request, Response, NextFunction } from 'express';
import cryptoAssetService from '../../services/crypto/crypto.asset.service';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Get user's crypto assets (all virtual accounts with balances)
 */
export async function getUserAssetsController(req: Request, res: Response) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized',
      });
    }

    const assets = await cryptoAssetService.getUserAssets(userId);

    return res.status(200).json({
      status: 200,
      message: 'Assets retrieved successfully',
      data: assets,
    });
  } catch (error: any) {
    console.error('Error in getUserAssetsController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve assets',
    });
  }
}

/**
 * Get single asset (virtual account) detail by ID
 */
export async function getAssetDetailController(req: Request, res: Response) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized',
      });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid asset ID',
      });
    }

    const asset = await cryptoAssetService.getAssetDetail(userId, parseInt(id));

    return res.status(200).json({
      status: 200,
      message: 'Asset detail retrieved successfully',
      data: asset,
    });
  } catch (error: any) {
    console.error('Error in getAssetDetailController:', error);
    
    if (error.message === 'Asset not found') {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve asset detail',
    });
  }
}

/**
 * Get deposit address for a currency and blockchain
 */
export async function getDepositAddressController(req: Request, res: Response) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;
    const { currency, blockchain } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized',
      });
    }

    if (!currency || !blockchain) {
      return res.status(400).json({
        status: 400,
        message: 'Currency and blockchain are required',
      });
    }

    const depositAddress = await cryptoAssetService.getDepositAddress(
      userId,
      currency,
      blockchain
    );

    return res.status(200).json({
      status: 200,
      message: 'Deposit address retrieved successfully',
      data: depositAddress,
    });
  } catch (error: any) {
    console.error('Error in getDepositAddressController:', error);
    
    if (error.message === 'Deposit address not found') {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve deposit address',
    });
  }
}

/**
 * Get deposit address by virtual account ID (for receive flow)
 * User selects an asset from their assets list and gets the deposit address
 */
export async function getReceiveAddressController(req: Request, res: Response) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;
    const { accountId } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized',
      });
    }

    if (!accountId || isNaN(parseInt(accountId))) {
      return res.status(400).json({
        status: 400,
        message: 'Valid account ID is required',
      });
    }

    const depositAddress = await cryptoAssetService.getDepositAddressByAccountId(
      userId,
      parseInt(accountId)
    );

    return res.status(200).json({
      status: 200,
      message: 'Deposit address retrieved successfully',
      data: depositAddress,
    });
  } catch (error: any) {
    console.error('Error in getReceiveAddressController:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve deposit address',
    });
  }
}

/**
 * Get USDT supporting blockchains
 * GET /api/v2/crypto/usdt/blockchains
 */
export const getUsdtBlockchainsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Query wallet_currencies for all USDT entries
    const usdtCurrencies = await prisma.walletCurrency.findMany({
      where: {
        OR: [
          { currency: 'USDT' },
          { currency: { startsWith: 'USDT_' } },
        ],
      },
      select: {
        id: true,
        blockchain: true,
        currency: true,
        name: true,
        blockchainName: true,
        tokenType: true,
        contractAddress: true,
        decimals: true,
        symbol: true,
      },
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    // Format response
    const blockchains = usdtCurrencies.map((currency) => ({
      blockchain: currency.blockchain.toLowerCase(),
      blockchainName: currency.blockchainName || currency.blockchain.toUpperCase(),
      currency: currency.currency,
      displayName: currency.name,
      tokenType: currency.tokenType,
      contractAddress: currency.contractAddress,
      decimals: currency.decimals,
      symbol: currency.symbol,
      // User-friendly display names
      displayLabel: currency.blockchainName || currency.blockchain.toUpperCase(),
    }));

    return res.status(200).json(
      new ApiResponse(200, {
        currency: 'USDT',
        blockchains,
        total: blockchains.length,
      }, 'USDT supporting blockchains retrieved successfully')
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to get USDT blockchains'));
  }
};

/**
 * Get total crypto balance for user
 * Returns total balance in USD and Naira from all virtual accounts
 */
export async function getCryptoBalanceController(req: Request, res: Response) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized',
      });
    }

    const balance = await cryptoAssetService.getCryptoBalance(userId);

    return res.status(200).json({
      status: 200,
      message: 'Crypto balance retrieved successfully',
      data: balance,
    });
  } catch (error: any) {
    console.error('Error in getCryptoBalanceController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve crypto balance',
    });
  }
}

