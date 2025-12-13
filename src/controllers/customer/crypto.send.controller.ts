/**
 * Crypto Send Controller
 * 
 * Handles user crypto send endpoints
 */

import { Request, Response, NextFunction } from 'express';
import cryptoSendService from '../../services/crypto/crypto.send.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { body, validationResult } from 'express-validator';

/**
 * Preview send transaction (finalize step)
 * POST /api/v2/crypto/send/preview
 */
export const previewSendController = async (
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

    const { amount, currency, blockchain, toAddress } = req.body;

    const preview = await cryptoSendService.previewSendTransaction(userId, amount, currency, blockchain, toAddress);

    return new ApiResponse(200, preview, 'Send transaction preview generated successfully').send(res);
  } catch (error: any) {
    console.error('Error in previewSendController:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.badRequest(error.message || 'Failed to generate send preview'));
  }
};

/**
 * Send cryptocurrency to external address
 * POST /api/v2/crypto/send
 */
export const sendCryptoController = async (
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

    const { amount, currency, blockchain, toAddress } = req.body;
    console.log('Sending cryptocurrency:', { amount, currency, blockchain, toAddress });

    const result = await cryptoSendService.sendCrypto({
      userId,
      amount,
      currency,
      blockchain,
      toAddress,
    });

    return new ApiResponse(200, result, 'Cryptocurrency sent successfully').send(res);
  } catch (error: any) {
    console.error('Error in sendCryptoController:', error);
    
    if (error.message.includes('Insufficient')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error.message.includes('not found') || error.message.includes('not supported')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error.message.includes('Invalid recipient address')) {
      return next(ApiError.badRequest(error.message));
    }
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to send cryptocurrency'));
  }
};

