/**
 * VTpass Cable TV Test Controller
 * 
 * Test endpoints for VTpass Cable TV Subscription API integration
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { vtpassCableService } from '../../services/vtpass/vtpass.cable.service';
import { VtpassCableServiceID } from '../../types/vtpass.types';

/**
 * Get Service Variations (Bouquet Plans)
 * GET /api/v2/test/vtpass/cable/variations?provider=dstv
 */
export const getVariationsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider } = req.query;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (dstv, gotv, startimes, showmax)'));
    }

    const validProviders: Record<string, VtpassCableServiceID> = {
      'dstv': VtpassCableServiceID.DSTV,
      'gotv': VtpassCableServiceID.GOTV,
      'startimes': VtpassCableServiceID.STARTIMES,
      'showmax': VtpassCableServiceID.SHOWMAX,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    const result = await vtpassCableService.getServiceVariations(serviceID);
    const variations = result.content.variations || result.content.varations || [];

    return res.status(200).json(
      new ApiResponse(200, {
        provider: normalizedProvider.toUpperCase(),
        serviceID,
        serviceName: result.content.ServiceName,
        convenienceFee: result.content.convinience_fee,
        variationsCount: variations.length,
        variations,
        fullResponse: result,
      }, 'Variations retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Get Variations Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get variations'));
  }
};

/**
 * Verify Smartcard Number (DSTV, GOTV, Startimes)
 * POST /api/v2/test/vtpass/cable/verify-smartcard
 */
export const verifySmartcardController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, smartcardNumber } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (dstv, gotv, startimes)'));
    }

    const validProviders = ['dstv', 'gotv', 'startimes'];
    const normalizedProvider = provider.toLowerCase();

    if (!validProviders.includes(normalizedProvider)) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${validProviders.join(', ')}`));
    }

    if (!smartcardNumber || typeof smartcardNumber !== 'string') {
      return next(ApiError.badRequest('smartcardNumber is required'));
    }

    const serviceID = normalizedProvider as VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV | VtpassCableServiceID.STARTIMES;
    const result = await vtpassCableService.verifySmartcard(serviceID, smartcardNumber);

    // Type guard to determine response type
    const isStartimes = normalizedProvider === 'startimes';
    const content = result.content as any;

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        provider: normalizedProvider.toUpperCase(),
        ...(isStartimes ? {
          customerName: content.Customer_Name,
          balance: content.Balance,
          smartcardNumber: content.Smartcard_Number,
          wrongBillersCode: content.WrongBillersCode,
        } : {
          customerName: content.Customer_Name,
          status: content.Status,
          dueDate: content.Due_Date,
          customerNumber: content.Customer_Number || null,
          customerType: content.Customer_Type,
          currentBouquet: content.Current_Bouquet || null,
          renewalAmount: content.Renewal_Amount || null,
        }),
        commissionDetails: content.commission_details || null,
        fullResponse: result,
      }, 'Smartcard verification completed')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Verify Smartcard Error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify smartcard'));
  }
};

/**
 * Purchase Cable TV - Change Bouquet (DSTV, GOTV)
 * POST /api/v2/test/vtpass/cable/purchase-change
 */
export const purchaseChangeBouquetController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, smartcardNumber, variation_code, phone, amount, quantity, request_id } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (dstv, gotv)'));
    }

    const validProviders = ['dstv', 'gotv'];
    const normalizedProvider = provider.toLowerCase();

    if (!validProviders.includes(normalizedProvider)) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${validProviders.join(', ')}`));
    }

    if (!smartcardNumber || !variation_code || !phone) {
      return next(ApiError.badRequest('Missing required fields: smartcardNumber, variation_code, phone'));
    }

    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }

    const serviceID = normalizedProvider as VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV;
    const result = await vtpassCableService.purchaseChangeBouquet(
      serviceID,
      smartcardNumber,
      variation_code,
      phone,
      amount,
      quantity,
      request_id
    );

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        provider: normalizedProvider.toUpperCase(),
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          smartcardNumber: result.content?.transactions?.unique_element || smartcardNumber,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
        },
        fullResponse: result,
      }, 'Change bouquet purchase completed')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Purchase Change Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase change bouquet'));
  }
};

/**
 * Purchase Cable TV - Renew Bouquet (DSTV, GOTV)
 * POST /api/v2/test/vtpass/cable/purchase-renew
 */
export const purchaseRenewBouquetController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, smartcardNumber, amount, phone, request_id } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (dstv, gotv)'));
    }

    const validProviders = ['dstv', 'gotv'];
    const normalizedProvider = provider.toLowerCase();

    if (!validProviders.includes(normalizedProvider)) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${validProviders.join(', ')}`));
    }

    if (!smartcardNumber || !amount || !phone) {
      return next(ApiError.badRequest('Missing required fields: smartcardNumber, amount, phone'));
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return next(ApiError.badRequest('Amount must be a positive number'));
    }

    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }

    const serviceID = normalizedProvider as VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV;
    const result = await vtpassCableService.purchaseRenewBouquet(
      serviceID,
      smartcardNumber,
      amount,
      phone,
      request_id
    );

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        provider: normalizedProvider.toUpperCase(),
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          smartcardNumber: result.content?.transactions?.unique_element || smartcardNumber,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
        },
        fullResponse: result,
      }, 'Renew bouquet purchase completed')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Purchase Renew Error:', error);
    return next(ApiError.internal(error.message || 'Failed to renew bouquet'));
  }
};

/**
 * Purchase Cable TV - Simple Purchase (DSTV, GOTV, Startimes, Showmax)
 * POST /api/v2/test/vtpass/cable/purchase
 */
export const purchaseSimpleController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, billersCode, variation_code, phone, amount, request_id } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (dstv, gotv, startimes, showmax)'));
    }

    const validProviders: Record<string, VtpassCableServiceID> = {
      'dstv': VtpassCableServiceID.DSTV,
      'gotv': VtpassCableServiceID.GOTV,
      'startimes': VtpassCableServiceID.STARTIMES,
      'showmax': VtpassCableServiceID.SHOWMAX,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    if (!billersCode || !variation_code || !phone) {
      return next(ApiError.badRequest('Missing required fields: billersCode, variation_code, phone'));
    }

    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }
    const result = await vtpassCableService.purchaseSimple(
      serviceID,
      billersCode,
      variation_code,
      phone,
      amount,
      request_id
    );

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        provider: normalizedProvider.toUpperCase(),
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          billersCode: result.content?.transactions?.unique_element || billersCode,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
          purchasedCode: result.purchased_code || null,
          voucher: (result as any).Voucher || null,
        },
        fullResponse: result,
      }, 'Purchase completed')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Purchase Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase'));
  }
};

/**
 * Query Transaction Status
 * POST /api/v2/test/vtpass/cable/query
 */
export const queryTransactionStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { request_id } = req.body;

    if (!request_id || typeof request_id !== 'string') {
      return next(ApiError.badRequest('request_id is required and must be a string'));
    }

    const result = await vtpassCableService.queryTransactionStatus(request_id);

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          billersCode: result.content?.transactions?.unique_element || null,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
          transactionDate: result.transaction_date || null,
          purchasedCode: result.purchased_code || null,
          voucher: (result as any).Voucher || null,
        },
        fullResponse: result,
      }, 'Transaction query completed')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Query Error:', error);
    return next(ApiError.internal(error.message || 'Failed to query transaction status'));
  }
};

/**
 * Get Test Information
 * GET /api/v2/test/vtpass/cable/info
 */
export const getCableTestInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const providers = [
      {
        id: 'dstv',
        name: 'DSTV',
        serviceID: VtpassCableServiceID.DSTV,
        description: 'DSTV Subscription Payment',
        supportsRenewal: true,
        requiresVerification: true,
      },
      {
        id: 'gotv',
        name: 'GOTV',
        serviceID: VtpassCableServiceID.GOTV,
        description: 'GOTV Subscription Payment',
        supportsRenewal: true,
        requiresVerification: true,
      },
      {
        id: 'startimes',
        name: 'Startimes',
        serviceID: VtpassCableServiceID.STARTIMES,
        description: 'Startimes Subscription Payment',
        supportsRenewal: false,
        requiresVerification: true,
      },
      {
        id: 'showmax',
        name: 'Showmax',
        serviceID: VtpassCableServiceID.SHOWMAX,
        description: 'Showmax Subscription Payment',
        supportsRenewal: false,
        requiresVerification: false,
      },
    ];

    const testScenarios = [
      {
        scenario: 'success',
        smartcardNumber: '1212121212',
        description: 'Returns a successful response for testing cable TV purchases',
      },
      {
        scenario: 'pending',
        smartcardNumber: '201000000000',
        description: 'Simulates an unexpected pending response',
      },
      {
        scenario: 'unexpected',
        smartcardNumber: '500000000000',
        description: 'Simulates an expected response, used to test how your system handles anomalies',
      },
      {
        scenario: 'noResponse',
        smartcardNumber: '400000000000',
        description: 'Simulates a scenario where the API returns no response',
      },
      {
        scenario: 'timeout',
        smartcardNumber: '300000000000',
        description: 'Simulates a timeout scenario for testing response handling under delays',
      },
    ];

    const endpoints = {
      getVariations: {
        method: 'GET',
        url: '/api/v2/test/vtpass/cable/variations?provider={provider}',
        description: 'Get available bouquet plans for a provider',
        example: 'GET /api/v2/test/vtpass/cable/variations?provider=dstv',
      },
      verifySmartcard: {
        method: 'POST',
        url: '/api/v2/test/vtpass/cable/verify-smartcard',
        description: 'Verify smartcard number (DSTV, GOTV, Startimes only)',
        requiredFields: ['provider', 'smartcardNumber'],
        example: {
          provider: 'dstv',
          smartcardNumber: '1212121212',
        },
      },
      purchaseChange: {
        method: 'POST',
        url: '/api/v2/test/vtpass/cable/purchase-change',
        description: 'Purchase/Change bouquet (DSTV, GOTV only)',
        requiredFields: ['provider', 'smartcardNumber', 'variation_code', 'phone'],
        example: {
          provider: 'dstv',
          smartcardNumber: '1212121212',
          variation_code: 'dstv-padi',
          phone: '08011111111',
        },
      },
      purchaseRenew: {
        method: 'POST',
        url: '/api/v2/test/vtpass/cable/purchase-renew',
        description: 'Renew current bouquet (DSTV, GOTV only)',
        requiredFields: ['provider', 'smartcardNumber', 'amount', 'phone'],
        example: {
          provider: 'dstv',
          smartcardNumber: '1212121212',
          amount: 1850,
          phone: '08011111111',
        },
      },
      purchase: {
        method: 'POST',
        url: '/api/v2/test/vtpass/cable/purchase',
        description: 'Purchase subscription (Startimes, Showmax)',
        requiredFields: ['provider', 'billersCode', 'variation_code', 'phone'],
        example: {
          provider: 'startimes',
          billersCode: '1212121212',
          variation_code: 'nova',
          phone: '08011111111',
        },
      },
      query: {
        method: 'POST',
        url: '/api/v2/test/vtpass/cable/query',
        description: 'Query transaction status by request_id',
        requiredFields: ['request_id'],
        example: {
          request_id: '2025031010146932932',
        },
      },
    };

    return res.status(200).json(
      new ApiResponse(200, {
        providers,
        testScenarios,
        endpoints,
        environment: {
          sandbox: 'https://sandbox.vtpass.com/api',
          live: 'https://vtpass.com/api',
          current: process.env.VTPASS_ENVIRONMENT || 'sandbox',
        },
        notes: [
          'All endpoints are for testing purposes only',
          'Use sandbox credentials for testing',
          'Get variations first to see available bouquet plans',
          'DSTV and GOTV support both "change" and "renew" subscription types',
          'DSTV/GOTV: Verify smartcard first, then use Renewal_Amount for renew or variation_code for change',
          'Startimes: Verify smartcard first, then purchase with variation_code',
          'Showmax: No verification needed, purchase directly with phone number',
          'Sandbox smartcard: 1212121212',
          'Phone numbers must be 11 digits starting with 0',
          'Request ID format: YYYYMMDDHHII + alphanumeric suffix (Lagos timezone)',
        ],
      }, 'Test information retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS CABLE TEST] Info Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get test information'));
  }
};

