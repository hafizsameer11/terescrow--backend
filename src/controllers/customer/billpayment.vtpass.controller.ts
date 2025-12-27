/**
 * VTpass Bill Payment Controllers
 * Dedicated controllers for VTpass bill payment operations
 */

import { Request, Response, NextFunction } from 'express';
import { vtpassBillPaymentService } from '../../services/vtpass/vtpass.billpayment.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Query VTpass Billers (Operators) for a scene code
 * GET /api/v2/bill-payments/vtpass/billers?sceneCode=airtime
 */
export const queryVtpassBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Validate scene code for VTpass
    const validSceneCodes = ['airtime', 'data', 'cable', 'electricity', 'education'];
    if (!validSceneCodes.includes(sceneCode)) {
      return next(ApiError.badRequest(`Invalid sceneCode. Must be one of: ${validSceneCodes.join(', ')}`));
    }

    const billers = await vtpassBillPaymentService.queryBillers(sceneCode as any);

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: 'vtpass',
        billers: billers.map(biller => ({
          billerId: biller.billerId,
          billerName: biller.billerName,
          serviceID: biller.serviceID,
        })),
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query VTpass billers'));
  }
};

/**
 * Query VTpass Items (Packages) for a biller
 * GET /api/v2/bill-payments/vtpass/items?sceneCode=airtime&billerId=MTN
 */
export const queryVtpassItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, billerId } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Validate scene code for VTpass
    const validSceneCodes = ['airtime', 'data', 'cable', 'electricity', 'education'];
    if (!validSceneCodes.includes(sceneCode)) {
      return next(ApiError.badRequest(`Invalid sceneCode. Must be one of: ${validSceneCodes.join(', ')}`));
    }

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    const items = await vtpassBillPaymentService.queryItems(sceneCode as any, billerId);

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: 'vtpass',
        billerId,
        items: items.map(item => ({
          billerId: item.billerId,
          itemId: item.itemId,
          itemName: item.itemName,
          amount: item.amount,
          serviceID: item.serviceID,
        })),
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query VTpass items'));
  }
};

/**
 * Verify VTpass Recharge Account
 * POST /api/v2/bill-payments/vtpass/verify-account
 */
export const verifyVtpassAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, rechargeAccount, billerId, itemId } = req.body;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Validate scene code for VTpass
    const validSceneCodes = ['airtime', 'data', 'cable', 'electricity', 'education'];
    if (!validSceneCodes.includes(sceneCode)) {
      return next(ApiError.badRequest(`Invalid sceneCode. Must be one of: ${validSceneCodes.join(', ')}`));
    }

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (rechargeAccount.length > 50) {
      return next(ApiError.badRequest('rechargeAccount must be 50 characters or less'));
    }

    if (!billerId) {
      return next(ApiError.badRequest('billerId is required for VTpass verification'));
    }

    // For electricity, itemId (meterType) is required
    if (sceneCode === 'electricity' && (!itemId || (itemId !== 'prepaid' && itemId !== 'postpaid'))) {
      return next(ApiError.badRequest('itemId is required and must be "prepaid" or "postpaid" for electricity'));
    }

    const result = await vtpassBillPaymentService.queryRechargeAccount(
      sceneCode as any,
      rechargeAccount,
      billerId,
      itemId
    );

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: 'vtpass',
        rechargeAccount,
        biller: result.biller || result.billerId,
        valid: result.valid !== false,
        result,
      })
    );
  } catch (error: any) {
    // If account is invalid, return error but don't crash
    if (error.message?.includes('INVALID_RECHARGE_ACCOUNT')) {
      return res.status(200).json(
        new ApiResponse(200, {
          valid: false,
          error: error.message,
        })
      );
    }
    next(ApiError.internal(error.message || 'Failed to verify VTpass account'));
  }
};

/**
 * Create VTpass Bill Payment Order
 * POST /api/v2/bill-payments/vtpass/create-order
 */
export const createVtpassBillOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin, phone } = req.body;

    // Validate inputs
    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Validate scene code for VTpass
    const validSceneCodes = ['airtime', 'data', 'cable', 'electricity', 'education'];
    if (!validSceneCodes.includes(sceneCode)) {
      return next(ApiError.badRequest(`Invalid sceneCode. Must be one of: ${validSceneCodes.join(', ')}`));
    }

    if (!billerId || !rechargeAccount || !amount) {
      return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
    }

    // For VTpass, itemId is optional for airtime, required for others
    if (sceneCode !== 'airtime' && !itemId) {
      return next(ApiError.badRequest(`itemId is required for VTpass ${sceneCode}`));
    }

    // Phone is required for VTpass
    if (!phone || typeof phone !== 'string') {
      return next(ApiError.badRequest('phone is required for VTpass'));
    }

    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return next(ApiError.badRequest('Invalid PIN. Must be 4 digits'));
    }

    // Import the main create controller logic (we'll reuse it)
    // Actually, let's call the main controller with provider hardcoded to 'vtpass'
    // But we need to modify the request body first
    req.body.provider = 'vtpass';
    
    // Import and call the main controller
    const { createBillOrderController } = await import('./billpayment.controller');
    return createBillOrderController(req, res, next);
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to create VTpass bill payment order'));
  }
};

/**
 * Query VTpass Bill Payment Order Status
 * GET /api/v2/bill-payments/vtpass/order-status?billPaymentId=xxx
 */
export const queryVtpassOrderStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // For VTpass, we still query from database, so we can reuse the main controller
    // But ensure it's a VTpass payment
    const { billPaymentId } = req.query;
    
    if (!billPaymentId) {
      return next(ApiError.badRequest('billPaymentId is required'));
    }

    // Import and call the main controller
    const { queryOrderStatusController } = await import('./billpayment.controller');
    return queryOrderStatusController(req, res, next);
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query VTpass order status'));
  }
};

/**
 * Get VTpass Bill Payment History
 * GET /api/v2/bill-payments/vtpass/history
 */
export const getVtpassBillPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Add provider filter to query
    req.query.provider = 'vtpass';
    
    // Import and call the main controller
    const { getBillPaymentHistoryController } = await import('./billpayment.controller');
    return getBillPaymentHistoryController(req, res, next);
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to get VTpass bill payment history'));
  }
};

