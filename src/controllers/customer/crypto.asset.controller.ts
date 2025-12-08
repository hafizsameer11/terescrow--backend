/**
 * Crypto Asset Controller
 * 
 * Handles user crypto asset endpoints
 */

import { Request, Response } from 'express';
import cryptoAssetService from '../../services/crypto/crypto.asset.service';

/**
 * Get user's crypto assets (all virtual accounts with balances)
 */
export async function getUserAssetsController(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

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
    const userId = (req as any).user?.id;
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
    const userId = (req as any).user?.id;
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
    const userId = (req as any).user?.id;
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

