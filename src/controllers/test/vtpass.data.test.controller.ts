/**
 * VTpass Data Test Controller
 * 
 * Test endpoints for VTpass Data Subscription API integration
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { vtpassDataService } from '../../services/vtpass/vtpass.data.service';
import { VtpassDataServiceID } from '../../types/vtpass.types';

/**
 * Get Service Variations (Data Plans)
 * GET /api/v2/test/vtpass/data/variations?provider=mtn
 */
export const getVariationsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider } = req.query;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (mtn, glo, airtel, etisalat, glo-sme, smile)'));
    }

    const validProviders: Record<string, string> = {
      'mtn': VtpassDataServiceID.MTN,
      'glo': VtpassDataServiceID.GLO,
      'airtel': VtpassDataServiceID.AIRTEL,
      'etisalat': VtpassDataServiceID.ETISALAT,
      'glo-sme': VtpassDataServiceID.GLO_SME,
      'smile': VtpassDataServiceID.SMILE,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    const result = await vtpassDataService.getServiceVariations(serviceID);
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
    console.error('[VTPASS DATA TEST] Get Variations Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get variations'));
  }
};

/**
 * Purchase Data Bundle
 * POST /api/v2/test/vtpass/data/purchase
 */
export const purchaseDataController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, billersCode, variation_code, phone, amount, request_id } = req.body;

    // Validate provider
    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (mtn, glo, airtel, etisalat, glo-sme, smile)'));
    }

    const validProviders: Record<string, string> = {
      'mtn': VtpassDataServiceID.MTN,
      'glo': VtpassDataServiceID.GLO,
      'airtel': VtpassDataServiceID.AIRTEL,
      'etisalat': VtpassDataServiceID.ETISALAT,
      'glo-sme': VtpassDataServiceID.GLO_SME,
      'smile': VtpassDataServiceID.SMILE,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    // Validate required fields
    if (!billersCode || typeof billersCode !== 'string') {
      return next(ApiError.badRequest('billersCode is required (phone number or account ID)'));
    }

    if (!variation_code || typeof variation_code !== 'string') {
      return next(ApiError.badRequest('variation_code is required'));
    }

    if (!phone || typeof phone !== 'string') {
      return next(ApiError.badRequest('Phone number is required and must be a string'));
    }

    // Validate phone format (should start with 0 and be 11 digits, except for Smile which uses email)
    if (serviceID !== VtpassDataServiceID.SMILE && !/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits (e.g., 08011111111)'));
    }

    const result = await vtpassDataService.purchaseData(
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
        },
        fullResponse: result,
      }, 'Purchase request completed')
    );
  } catch (error: any) {
    console.error('[VTPASS DATA TEST] Purchase Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase data'));
  }
};

/**
 * Verify Smile Email
 * POST /api/v2/test/vtpass/data/verify-smile-email
 */
export const verifySmileEmailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return next(ApiError.badRequest('Email is required and must be a string'));
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(ApiError.badRequest('Invalid email format'));
    }

    const result = await vtpassDataService.verifySmileEmail(email);

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        customerName: result.content?.Customer_Name || null,
        accounts: result.content?.AccountList?.Account || [],
        accountsCount: result.content?.AccountList?.NumberOfAccounts || 0,
        fullResponse: result,
      }, 'Smile email verification completed')
    );
  } catch (error: any) {
    console.error('[VTPASS DATA TEST] Verify Smile Email Error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify Smile email'));
  }
};

/**
 * Query Transaction Status
 * POST /api/v2/test/vtpass/data/query
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

    const result = await vtpassDataService.queryTransactionStatus(request_id);

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
        },
        fullResponse: result,
      }, 'Transaction query completed')
    );
  } catch (error: any) {
    console.error('[VTPASS DATA TEST] Query Error:', error);
    return next(ApiError.internal(error.message || 'Failed to query transaction status'));
  }
};

/**
 * Get Test Information
 * GET /api/v2/test/vtpass/data/info
 */
export const getDataTestInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const providers = [
      {
        id: 'mtn',
        name: 'MTN Data',
        serviceID: VtpassDataServiceID.MTN,
        description: 'MTN Data Subscription',
      },
      {
        id: 'glo',
        name: 'GLO Data',
        serviceID: VtpassDataServiceID.GLO,
        description: 'GLO Data Subscription',
      },
      {
        id: 'airtel',
        name: 'Airtel Data',
        serviceID: VtpassDataServiceID.AIRTEL,
        description: 'Airtel Data Subscription',
      },
      {
        id: 'etisalat',
        name: '9mobile Data',
        serviceID: VtpassDataServiceID.ETISALAT,
        description: '9mobile (formerly Etisalat) Data Subscription',
      },
      {
        id: 'glo-sme',
        name: 'GLO SME Data',
        serviceID: VtpassDataServiceID.GLO_SME,
        description: 'GLO SME Data Subscription',
      },
      {
        id: 'smile',
        name: 'Smile Network',
        serviceID: VtpassDataServiceID.SMILE,
        description: 'Smile Network Data Payment',
        requiresEmailVerification: true,
        sandboxEmail: 'tester@sandbox.com',
      },
    ];

    const testScenarios = [
      {
        scenario: 'success',
        phone: '08011111111',
        description: 'Returns a successful response for testing data purchases',
      },
      {
        scenario: 'pending',
        phone: '201000000000',
        description: 'Simulates an unexpected pending response',
      },
      {
        scenario: 'unexpected',
        phone: '500000000000',
        description: 'Simulates an expected response, used to test how your system handles anomalies',
      },
      {
        scenario: 'noResponse',
        phone: '400000000000',
        description: 'Simulates a scenario where the API returns no response',
      },
      {
        scenario: 'timeout',
        phone: '300000000000',
        description: 'Simulates a timeout scenario for testing response handling under delays',
      },
    ];

    const endpoints = {
      getVariations: {
        method: 'GET',
        url: '/api/v2/test/vtpass/data/variations?provider={provider}',
        description: 'Get available data plans/variations for a provider',
        example: 'GET /api/v2/test/vtpass/data/variations?provider=mtn',
      },
      purchase: {
        method: 'POST',
        url: '/api/v2/test/vtpass/data/purchase',
        description: 'Purchase data bundle for any provider',
        requiredFields: ['provider', 'billersCode', 'variation_code', 'phone'],
        example: {
          provider: 'mtn',
          billersCode: '08011111111',
          variation_code: 'mtn-10mb-100',
          phone: '08011111111',
        },
      },
      verifySmileEmail: {
        method: 'POST',
        url: '/api/v2/test/vtpass/data/verify-smile-email',
        description: 'Verify Smile email and get account list (Smile only)',
        requiredFields: ['email'],
        example: {
          email: 'tester@sandbox.com',
        },
      },
      query: {
        method: 'POST',
        url: '/api/v2/test/vtpass/data/query',
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
          'Get variations first to see available data plans',
          'Use variation_code from variations response to purchase',
          'Phone numbers must be 11 digits starting with 0 (except Smile)',
          'Smile requires email verification before purchase',
          'Request ID format: YYYYMMDDHHII + alphanumeric suffix (Lagos timezone)',
        ],
      }, 'Test information retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS DATA TEST] Info Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get test information'));
  }
};

