/**
 * VTpass Education Test Controller
 * 
 * Test endpoints for VTpass Education Services API integration
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { vtpassEducationService } from '../../services/vtpass/vtpass.education.service';
import { VtpassEducationServiceID } from '../../types/vtpass.types';

/**
 * Get Service Variations
 * GET /api/v2/test/vtpass/education/variations?service=waec-registration
 */
export const getVariationsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { service } = req.query;

    if (!service || typeof service !== 'string') {
      return next(ApiError.badRequest('Service is required and must be a string (waec-registration, waec, jamb)'));
    }

    const validServices: Record<string, string> = {
      'waec-registration': VtpassEducationServiceID.WAEC_REGISTRATION,
      'waec': VtpassEducationServiceID.WAEC_RESULT_CHECKER,
      'jamb': VtpassEducationServiceID.JAMB,
    };

    const normalizedService = service.toLowerCase();
    const serviceID = validServices[normalizedService];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid service. Must be one of: ${Object.keys(validServices).join(', ')}`));
    }

    const result = await vtpassEducationService.getServiceVariations(serviceID);
    const variations = result.content.variations || result.content.varations || [];

    return res.status(200).json(
      new ApiResponse(200, {
        service: normalizedService,
        serviceID,
        serviceName: result.content.ServiceName,
        convenienceFee: result.content.convinience_fee,
        variationsCount: variations.length,
        variations,
        fullResponse: result,
      }, 'Variations retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS EDUCATION TEST] Get Variations Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get variations'));
  }
};

/**
 * Verify JAMB Profile ID
 * POST /api/v2/test/vtpass/education/verify-jamb
 */
export const verifyJambProfileController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { profileId, variationCode } = req.body;

    if (!profileId || typeof profileId !== 'string') {
      return next(ApiError.badRequest('profileId is required'));
    }

    if (!variationCode || typeof variationCode !== 'string') {
      return next(ApiError.badRequest('variationCode is required (e.g., utme-mock, utme-no-mock)'));
    }

    const result = await vtpassEducationService.verifyJambProfile(profileId, variationCode);

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        customerName: result.content.Customer_Name,
        commissionDetails: result.content.commission_details || null,
        fullResponse: result,
      }, 'JAMB profile verification completed')
    );
  } catch (error: any) {
    console.error('[VTPASS EDUCATION TEST] Verify JAMB Profile Error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify JAMB profile'));
  }
};

/**
 * Purchase Education Service
 * POST /api/v2/test/vtpass/education/purchase
 */
export const purchaseEducationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { service, variation_code, phone, profileId, quantity, amount, request_id } = req.body;

    if (!service || typeof service !== 'string') {
      return next(ApiError.badRequest('Service is required and must be a string'));
    }

    const validServices: Record<string, string> = {
      'waec-registration': VtpassEducationServiceID.WAEC_REGISTRATION,
      'waec': VtpassEducationServiceID.WAEC_RESULT_CHECKER,
      'jamb': VtpassEducationServiceID.JAMB,
    };

    const normalizedService = service.toLowerCase();
    const serviceID = validServices[normalizedService];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid service. Must be one of: ${Object.keys(validServices).join(', ')}`));
    }

    if (!variation_code || !phone) {
      return next(ApiError.badRequest('Missing required fields: variation_code, phone'));
    }

    // JAMB requires profileId
    if (normalizedService === 'jamb' && !profileId) {
      return next(ApiError.badRequest('profileId is required for JAMB'));
    }

    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }

    const result = await vtpassEducationService.purchaseEducation(
      serviceID,
      variation_code,
      phone,
      profileId,
      quantity,
      amount,
      request_id
    );

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        service: normalizedService,
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
        },
        ...(normalizedService === 'jamb' ? {
          pin: result.Pin || result.purchased_code || null,
        } : normalizedService === 'waec-registration' ? {
          tokens: result.tokens || (result.purchased_code ? [result.purchased_code.replace(/^Token\s*:\s*/i, '')] : null),
        } : {
          cards: result.cards || null,
          purchasedCode: result.purchased_code || null,
        }),
        fullResponse: result,
      }, 'Education service purchase completed')
    );
  } catch (error: any) {
    console.error('[VTPASS EDUCATION TEST] Purchase Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase education service'));
  }
};

/**
 * Query Transaction Status
 * POST /api/v2/test/vtpass/education/query
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

    const result = await vtpassEducationService.queryTransactionStatus(request_id);

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
          transactionDate: result.transaction_date || null,
        },
        fullResponse: result,
      }, 'Transaction query completed')
    );
  } catch (error: any) {
    console.error('[VTPASS EDUCATION TEST] Query Error:', error);
    return next(ApiError.internal(error.message || 'Failed to query transaction status'));
  }
};

/**
 * Get Test Information
 * GET /api/v2/test/vtpass/education/info
 */
export const getEducationTestInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const services = [
      {
        id: 'waec-registration',
        name: 'WAEC Registration',
        serviceID: VtpassEducationServiceID.WAEC_REGISTRATION,
        description: 'WAEC Registration PIN vending',
        requiresVerification: false,
        requiresProfileId: false,
      },
      {
        id: 'waec',
        name: 'WAEC Result Checker',
        serviceID: VtpassEducationServiceID.WAEC_RESULT_CHECKER,
        description: 'WAEC Result Checker PIN vending',
        requiresVerification: false,
        requiresProfileId: false,
      },
      {
        id: 'jamb',
        name: 'JAMB',
        serviceID: VtpassEducationServiceID.JAMB,
        description: 'JAMB PIN vending (UTME & Direct Entry)',
        requiresVerification: true,
        requiresProfileId: true,
        sandboxProfileId: '0123456789',
      },
    ];

    const endpoints = {
      getVariations: {
        method: 'GET',
        url: '/api/v2/test/vtpass/education/variations?service={service}',
        description: 'Get available plans/variations for a service',
        example: 'GET /api/v2/test/vtpass/education/variations?service=waec-registration',
      },
      verifyJamb: {
        method: 'POST',
        url: '/api/v2/test/vtpass/education/verify-jamb',
        description: 'Verify JAMB Profile ID (JAMB only)',
        requiredFields: ['profileId', 'variationCode'],
        example: {
          profileId: '0123456789',
          variationCode: 'utme-mock',
        },
      },
      purchase: {
        method: 'POST',
        url: '/api/v2/test/vtpass/education/purchase',
        description: 'Purchase education service',
        requiredFields: ['service', 'variation_code', 'phone'],
        jambRequiredFields: ['service', 'variation_code', 'phone', 'profileId'],
        example: {
          service: 'waec-registration',
          variation_code: 'waec-registraion',
          phone: '08011111111',
          quantity: 1,
        },
      },
      query: {
        method: 'POST',
        url: '/api/v2/test/vtpass/education/query',
        description: 'Query transaction status',
        requiredFields: ['request_id'],
        example: {
          request_id: '202503101430YUs83meikd',
        },
      },
    };

    return res.status(200).json(
      new ApiResponse(200, {
        services,
        endpoints,
        environment: {
          sandbox: 'https://sandbox.vtpass.com/api',
          live: 'https://vtpass.com/api',
          current: process.env.VTPASS_ENVIRONMENT || 'sandbox',
        },
        notes: [
          'All endpoints are for testing purposes only',
          'Use sandbox credentials for testing',
          'Get variations first to see available plans',
          'JAMB requires Profile ID verification before purchase',
          'JAMB sandbox Profile ID: 0123456789',
          'Phone numbers must be 11 digits starting with 0',
          'Request ID format: YYYYMMDDHHII + alphanumeric suffix (Lagos timezone)',
          'WAEC Registration returns tokens array',
          'WAEC Result Checker returns cards array with Serial and Pin',
          'JAMB returns Pin field',
        ],
      }, 'Test information retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS EDUCATION TEST] Info Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get test information'));
  }
};

