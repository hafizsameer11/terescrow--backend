/**
 * Crypto Swap Controller
 * 
 * Handles HTTP requests for crypto swap operations
 */

import { Request, Response, NextFunction } from 'express';
import cryptoSwapService from '../../services/crypto/crypto.swap.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Get available currencies for swapping (user must have balance > 0)
 */
export async function getAvailableCurrenciesForSwapController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const currencies = await cryptoSwapService.getAvailableCurrenciesForSwap(userId);

    return new ApiResponse(
      200,
      { currencies },
      'Available currencies for swapping retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getAvailableCurrenciesForSwapController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to retrieve available currencies'));
  }
}

/**
 * Calculate swap quote
 */
export async function calculateSwapQuoteController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = req.body;

    if (!fromAmount || !fromCurrency || !fromBlockchain || !toCurrency || !toBlockchain) {
      return next(ApiError.badRequest('Missing required fields: fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain'));
    }

    const quote = await cryptoSwapService.calculateSwapQuote({
      userId,
      fromAmount: parseFloat(fromAmount),
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    return new ApiResponse(200, quote, 'Swap quote calculated successfully').send(res);
  } catch (error: any) {
    console.error('Error in calculateSwapQuoteController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to calculate swap quote'));
  }
}

/**
 * Preview swap transaction
 */
export async function previewSwapController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = req.body;

    if (!fromAmount || !fromCurrency || !fromBlockchain || !toCurrency || !toBlockchain) {
      return next(ApiError.badRequest('Missing required fields: fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain'));
    }

    const preview = await cryptoSwapService.previewSwapTransaction({
      userId,
      fromAmount: parseFloat(fromAmount),
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    return new ApiResponse(200, preview, 'Swap transaction preview generated successfully').send(res);
  } catch (error: any) {
    console.error('Error in previewSwapController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to generate swap preview'));
  }
}

/**
 * Execute swap transaction
 */
export async function swapCryptoController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = req.body;

    if (!fromAmount || !fromCurrency || !fromBlockchain || !toCurrency || !toBlockchain) {
      return next(ApiError.badRequest('Missing required fields: fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain'));
    }

    const result = await cryptoSwapService.swapCrypto({
      userId,
      fromAmount: parseFloat(fromAmount),
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    return new ApiResponse(200, result, 'Cryptocurrency swapped successfully').send(res);
  } catch (error: any) {
    console.error('Error in swapCryptoController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to swap cryptocurrency'));
  }
}

