/**
 * Crypto Buy Controller
 *
 * Crypto buy is temporarily under maintenance (quote / preview / execute).
 * Full implementation remains in git history and can be restored by reverting
 * these handlers. Sell / send / receive / swap are unaffected.
 */

import { Request, Response, NextFunction } from 'express';
import cryptoBuyService from '../../services/crypto/crypto.buy.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { body, validationResult } from 'express-validator';

const CRYPTO_BUY_MAINTENANCE_MSG =
  'Crypto buy is temporarily under maintenance. Please try again later.';

/**
 * Calculate buy quote (preview)
 * POST /api/v2/crypto/buy/quote
 */
export const calculateBuyQuoteController = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  return next(ApiError.forbidden(CRYPTO_BUY_MAINTENANCE_MSG));
};

/**
 * Preview buy transaction (finalize step)
 * POST /api/v2/crypto/buy/preview
 */
export const previewBuyController = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  return next(ApiError.forbidden(CRYPTO_BUY_MAINTENANCE_MSG));
};

/**
 * Get available currencies for buying
 * GET /api/v2/crypto/buy/currencies
 */
export const getAvailableCurrenciesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currencies = await cryptoBuyService.getAvailableCurrencies();
    return new ApiResponse(200, { currencies }, 'Available currencies retrieved successfully').send(res);
  } catch (error: any) {
    console.error('Error in getAvailableCurrenciesController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve available currencies'));
  }
};

/**
 * Buy cryptocurrency
 * POST /api/v2/crypto/buy
 */
export const buyCryptoController = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  return next(ApiError.forbidden(CRYPTO_BUY_MAINTENANCE_MSG));
};

