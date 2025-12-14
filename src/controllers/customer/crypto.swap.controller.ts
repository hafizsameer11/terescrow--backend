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
 * Note: This uses the same service method as previewSwapController to ensure consistency
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

    console.log('[SWAP QUOTE] Request received:', {
      userId,
      fromAmount,
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    if (!fromAmount || !fromCurrency || !fromBlockchain || !toCurrency || !toBlockchain) {
      return next(ApiError.badRequest('Missing required fields: fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain'));
    }

    // Use previewSwapTransaction to ensure same logic as preview route
    const quote = await cryptoSwapService.previewSwapTransaction({
      userId,
      fromAmount: parseFloat(fromAmount),
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    console.log('[SWAP QUOTE] Quote calculated successfully:', {
      userId,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      gasFee: quote.gasFee,
      gasFeeUsd: quote.gasFeeUsd,
      hasSufficientBalance: quote.hasSufficientBalance,
      canProceed: quote.canProceed,
    });

    return new ApiResponse(200, quote, 'Swap quote calculated successfully').send(res);
  } catch (error: any) {
    console.error('[SWAP QUOTE] Error:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to calculate swap quote'));
  }
}

/**
 * Preview swap transaction
 * Note: This uses the same service method as calculateSwapQuoteController to ensure consistency
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

    console.log('[SWAP PREVIEW] Request received:', {
      userId,
      fromAmount,
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    if (!fromAmount || !fromCurrency || !fromBlockchain || !toCurrency || !toBlockchain) {
      return next(ApiError.badRequest('Missing required fields: fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain'));
    }

    // Use previewSwapTransaction (same as quote route)
    const preview = await cryptoSwapService.previewSwapTransaction({
      userId,
      fromAmount: parseFloat(fromAmount),
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
    });

    console.log('[SWAP PREVIEW] Preview generated successfully:', {
      userId,
      fromAmount: preview.fromAmount,
      toAmount: preview.toAmount,
      gasFee: preview.gasFee,
      gasFeeUsd: preview.gasFeeUsd,
      fromBalanceBefore: preview.fromBalanceBefore,
      toBalanceBefore: preview.toBalanceBefore,
      fromBalanceAfter: preview.fromBalanceAfter,
      toBalanceAfter: preview.toBalanceAfter,
      hasSufficientBalance: preview.hasSufficientBalance,
      hasSufficientEth: preview.hasSufficientEth,
      canProceed: preview.canProceed,
    });

    return new ApiResponse(200, preview, 'Swap transaction preview generated successfully').send(res);
  } catch (error: any) {
    console.error('[SWAP PREVIEW] Error:', error);
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

