/**
 * VTpass Test Controller
 * 
 * Test endpoints for VTpass MTN VTU API integration
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { vtpassAirtimeService } from '../../services/vtpass/vtpass.airtime.service';
import { VtpassAirtimeServiceID } from '../../types/vtpass.types';

/**
 * Test Purchase Airtime (All Providers)
 * POST /api/v2/test/vtpass/purchase
 */
export const testPurchaseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, phone, amount, request_id } = req.body;

    // Validate provider
    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string (mtn, glo, airtel, etisalat, 9mobile)'));
    }

    const validProviders = ['mtn', 'glo', 'airtel', 'etisalat', '9mobile'];
    const normalizedProvider = provider.toLowerCase();
    
    if (!validProviders.includes(normalizedProvider)) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${validProviders.join(', ')}`));
    }

    // Validate inputs
    if (!phone || typeof phone !== 'string') {
      return next(ApiError.badRequest('Phone number is required and must be a string'));
    }

    // Validate phone format (should start with 0 and be 11 digits)
    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits (e.g., 08011111111)'));
    }

    if (!amount || typeof amount !== 'number') {
      return next(ApiError.badRequest('Amount is required and must be a number'));
    }

    if (amount < 50) {
      return next(ApiError.badRequest('Minimum amount is 50 NGN'));
    }

    // Map provider to service ID (9mobile is etisalat in VTpass)
    const serviceID = (normalizedProvider === '9mobile' ? 'etisalat' : normalizedProvider) as VtpassAirtimeServiceID;

    // Call VTpass service
    const result = await vtpassAirtimeService.purchaseAirtime(
      serviceID,
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
          phone: result.content?.transactions?.unique_element || phone,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
        },
        fullResponse: result,
      }, 'Purchase request completed')
    );
  } catch (error: any) {
    console.error('[VTPASS TEST] Purchase Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase airtime'));
  }
};

/**
 * Test Query Transaction Status
 * POST /api/v2/test/vtpass/query
 */
export const testQueryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { request_id } = req.body;

    if (!request_id || typeof request_id !== 'string') {
      return next(ApiError.badRequest('request_id is required and must be a string'));
    }

    // Call VTpass service
    const result = await vtpassAirtimeService.queryTransactionStatus(request_id);

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
          phone: result.content?.transactions?.unique_element || null,
          productName: result.content?.transactions?.product_name || null,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
          transactionDate: result.transaction_date || null,
        },
        fullResponse: result,
      }, 'Transaction query completed')
    );
  } catch (error: any) {
    console.error('[VTPASS TEST] Query Error:', error);
    return next(ApiError.internal(error.message || 'Failed to query transaction status'));
  }
};

/**
 * Generate Request ID
 * GET /api/v2/test/vtpass/generate-request-id
 */
export const generateRequestIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requestId = vtpassAirtimeService.generateRequestId();
    
    // Parse the request ID to show its components
    const datePart = requestId.substring(0, 12);
    const suffixPart = requestId.substring(12);
    
    // Parse date components for display
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    const day = datePart.substring(6, 8);
    const hours = datePart.substring(8, 10);
    const minutes = datePart.substring(10, 12);
    
    return res.status(200).json(
      new ApiResponse(200, {
        requestId,
        breakdown: {
          dateTimePart: datePart,
          suffixPart: suffixPart,
          dateTime: {
            year,
            month,
            day,
            hours,
            minutes,
            formatted: `${year}-${month}-${day} ${hours}:${minutes} (Lagos Time)`,
          },
        },
        format: 'YYYYMMDDHHII + alphanumeric suffix',
        requirements: {
          totalLength: requestId.length,
          dateTimeLength: datePart.length,
          isValid: requestId.length >= 12 && /^\d{12}/.test(requestId),
          timezone: 'Africa/Lagos (GMT +1)',
        },
        note: 'Use this request_id when requesting live API keys from VTpass',
      }, 'Request ID generated successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS TEST] Generate Request ID Error:', error);
    return next(ApiError.internal(error.message || 'Failed to generate request ID'));
  }
};

/**
 * Test Sandbox Scenarios
 * POST /api/v2/test/vtpass/test-scenarios
 */
export const testScenariosController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { scenario, provider } = req.body;

    if (!scenario || typeof scenario !== 'string') {
      return next(ApiError.badRequest('scenario is required and must be a string'));
    }

    // Map scenarios to test phone numbers
    const testPhones: Record<string, { phone: string; description: string }> = {
      success: {
        phone: '08011111111',
        description: 'Returns a successful response for testing airtime purchases',
      },
      pending: {
        phone: '201000000000',
        description: 'Simulates an unexpected pending response',
      },
      unexpected: {
        phone: '500000000000',
        description: 'Simulates an expected response, used to test how your system handles anomalies',
      },
      noResponse: {
        phone: '400000000000',
        description: 'Simulates a scenario where the API returns no response',
      },
      timeout: {
        phone: '300000000000',
        description: 'Simulates a timeout scenario for testing response handling under delays',
      },
    };

    const testConfig = testPhones[scenario.toLowerCase()];

    if (!testConfig) {
      return next(ApiError.badRequest(`Invalid scenario. Valid scenarios: ${Object.keys(testPhones).join(', ')}`));
    }

    // Determine provider (default to MTN if not provided)
    const validProviders = ['mtn', 'glo', 'airtel', 'etisalat', '9mobile'];
    const normalizedProvider = provider ? provider.toLowerCase() : 'mtn';
    
    if (provider && !validProviders.includes(normalizedProvider)) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${validProviders.join(', ')}`));
    }

    // Map provider to service ID (9mobile is etisalat in VTpass)
    const serviceID = (normalizedProvider === '9mobile' ? 'etisalat' : normalizedProvider) as VtpassAirtimeServiceID;
    
    // Test with 100 NGN
    const result = await vtpassAirtimeService.purchaseAirtime(
      serviceID,
      testConfig.phone,
      100
    );

    return res.status(200).json(
      new ApiResponse(200, {
        scenario,
        provider: normalizedProvider.toUpperCase(),
        testPhone: testConfig.phone,
        description: testConfig.description,
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          phone: result.content?.transactions?.unique_element || testConfig.phone,
        },
        fullResponse: result,
      }, `Test scenario '${scenario}' completed`)
    );
  } catch (error: any) {
    console.error('[VTPASS TEST] Scenario Error:', error);
    return res.status(200).json(
      new ApiResponse(200, {
        scenario: req.body.scenario,
        provider: req.body.provider || 'MTN',
        success: false,
        error: error.message || 'Failed to execute test scenario',
        note: 'This may be expected behavior for certain test scenarios (e.g., timeout, no response)',
      }, 'Test scenario executed (error may be expected)')
    );
  }
};

/**
 * Get Test Information
 * GET /api/v2/test/vtpass/info
 */
export const getTestInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const providers = [
      {
        id: 'mtn',
        name: 'MTN',
        serviceID: 'mtn',
        description: 'MTN Nigeria Airtime VTU',
      },
      {
        id: 'glo',
        name: 'GLO',
        serviceID: 'glo',
        description: 'GLO Mobile Airtime VTU',
      },
      {
        id: 'airtel',
        name: 'Airtel',
        serviceID: 'airtel',
        description: 'Airtel Nigeria Airtime VTU',
      },
      {
        id: 'etisalat',
        name: '9mobile',
        serviceID: 'etisalat',
        description: '9mobile (formerly Etisalat) Airtime VTU',
        aliases: ['9mobile'],
      },
    ];

    const testScenarios = [
      {
        scenario: 'success',
        phone: '08011111111',
        description: 'Returns a successful response for testing airtime purchases',
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
      purchase: {
        method: 'POST',
        url: '/api/v2/test/vtpass/purchase',
        description: 'Purchase airtime for any provider',
        requiredFields: ['provider', 'phone', 'amount'],
        example: {
          provider: 'mtn',
          phone: '08011111111',
          amount: 100,
        },
      },
      query: {
        method: 'POST',
        url: '/api/v2/test/vtpass/query',
        description: 'Query transaction status by request_id',
        requiredFields: ['request_id'],
        example: {
          request_id: '2025031010146932932',
        },
      },
      testScenarios: {
        method: 'POST',
        url: '/api/v2/test/vtpass/test-scenarios',
        description: 'Test sandbox scenarios',
        requiredFields: ['scenario'],
        optionalFields: ['provider'],
        example: {
          scenario: 'success',
          provider: 'mtn',
        },
      },
      generateRequestId: {
        method: 'GET',
        url: '/api/v2/test/vtpass/generate-request-id',
        description: 'Generate a valid VTpass request_id',
        example: 'GET /api/v2/test/vtpass/generate-request-id',
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
          'Phone numbers must be 11 digits starting with 0',
          'Minimum amount is 50 NGN',
          'Request ID format: YYYYMMDDHHII + alphanumeric suffix (Lagos timezone)',
          'Use generate-request-id endpoint to get a valid request_id for live API key requests',
        ],
      }, 'Test information retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS TEST] Info Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get test information'));
  }
};

