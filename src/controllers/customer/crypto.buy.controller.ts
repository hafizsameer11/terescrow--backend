/**
 * Crypto Buy Controller
 * 
 * Handles user crypto purchase endpoints
 */

import { Request, Response, NextFunction } from 'express';
import cryptoBuyService from '../../services/crypto/crypto.buy.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { body, validationResult } from 'express-validator';

/**
 * Calculate buy quote (preview)
 * POST /api/v2/crypto/buy/quote
 */
export const calculateBuyQuoteController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    const user = (req as any).body?._user;
    const userId = user?.id;
    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { amount, currency, blockchain } = req.body;

    const quote = await cryptoBuyService.calculateBuyQuote(amount, currency, blockchain);

    return new ApiResponse(200, quote, 'Buy quote calculated successfully').send(res);
  } catch (error: any) {
    console.error('Error in calculateBuyQuoteController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.badRequest(error.message || 'Failed to calculate buy quote'));
  }
};

/**
 * Preview buy transaction (finalize step)
 * POST /api/v2/crypto/buy/preview
 */
export const previewBuyController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    const user = (req as any).body?._user;
    const userId = user?.id;
    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { amount, currency, blockchain } = req.body;

    const preview = await cryptoBuyService.previewBuyTransaction(userId, amount, currency, blockchain);

    return new ApiResponse(200, preview, 'Buy transaction preview generated successfully').send(res);
  } catch (error: any) {
    console.error('Error in previewBuyController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.badRequest(error.message || 'Failed to generate buy preview'));
  }
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
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    const user = (req as any).user || (req as any).body?._user;
    const userId = user?.id;
    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }
    const { getCustomerRestrictions, isFeatureFrozen, FEATURE_CRYPTO } = await import('../../utils/customer.restrictions');
    const restrictions = await getCustomerRestrictions(userId);
    if (restrictions.banned) return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    if (isFeatureFrozen(restrictions, FEATURE_CRYPTO)) return next(ApiError.forbidden('Crypto operations are temporarily disabled for your account.'));

    const { amount, currency, blockchain } = req.body;
    console.log('Buying cryptocurrency:', { amount, currency, blockchain });

    const result = await cryptoBuyService.buyCrypto({
      userId,
      amount,
      currency,
      blockchain,
    });

    return new ApiResponse(200, result, 'Cryptocurrency purchased successfully').send(res);
  } catch (error: any) {
    console.error('Error in buyCryptoController:', error);
    
    if (error.message.includes('Insufficient')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error.message.includes('not found') || error.message.includes('not supported')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to purchase cryptocurrency'));
  }
};

