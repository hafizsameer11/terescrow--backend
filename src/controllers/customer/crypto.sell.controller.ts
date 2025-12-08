/**
 * Crypto Sell Controller
 * 
 * Handles user crypto sell endpoints
 */

import { Request, Response, NextFunction } from 'express';
import cryptoSellService from '../../services/crypto/crypto.sell.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { body, validationResult } from 'express-validator';

/**
 * Calculate sell quote (preview)
 * POST /api/v2/crypto/sell/quote
 */
export const calculateSellQuoteController = async (
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

    const quote = await cryptoSellService.calculateSellQuote(amount, currency, blockchain);

    return new ApiResponse(200, quote, 'Sell quote calculated successfully').send(res);
  } catch (error: any) {
    console.error('Error in calculateSellQuoteController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.badRequest(error.message || 'Failed to calculate sell quote'));
  }
};

/**
 * Preview sell transaction (finalize step)
 * POST /api/v2/crypto/sell/preview
 */
export const previewSellController = async (
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

    const preview = await cryptoSellService.previewSellTransaction(userId, amount, currency, blockchain);

    return new ApiResponse(200, preview, 'Sell transaction preview generated successfully').send(res);
  } catch (error: any) {
    console.error('Error in previewSellController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.badRequest(error.message || 'Failed to generate sell preview'));
  }
};

/**
 * Get available currencies for selling (user must have balance > 0)
 * GET /api/v2/crypto/sell/currencies
 */
export const getAvailableCurrenciesForSellController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;
    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const currencies = await cryptoSellService.getAvailableCurrenciesForSell(userId);
    return new ApiResponse(200, { currencies }, 'Available currencies for selling retrieved successfully').send(res);
  } catch (error: any) {
    console.error('Error in getAvailableCurrenciesForSellController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve available currencies'));
  }
};

/**
 * Sell cryptocurrency
 * POST /api/v2/crypto/sell
 */
export const sellCryptoController = async (
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

    const result = await cryptoSellService.sellCrypto({
      userId,
      amount,
      currency,
      blockchain,
    });

    return new ApiResponse(200, result, 'Cryptocurrency sold successfully').send(res);
  } catch (error: any) {
    console.error('Error in sellCryptoController:', error);
    
    if (error.message.includes('Insufficient')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error.message.includes('not found') || error.message.includes('not supported')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to sell cryptocurrency'));
  }
};

