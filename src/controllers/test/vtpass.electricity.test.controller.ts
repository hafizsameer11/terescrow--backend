/**
 * VTpass Electricity Test Controller
 * 
 * Test endpoints for VTpass Electricity Bill Payment API integration
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { vtpassElectricityService } from '../../services/vtpass/vtpass.electricity.service';
import { VtpassElectricityServiceID } from '../../types/vtpass.types';

/**
 * Verify Meter Number
 * POST /api/v2/test/vtpass/electricity/verify
 */
export const verifyMeterController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, meterNumber, meterType } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string'));
    }

    const validProviders: Record<string, string> = {
      'ikedc': VtpassElectricityServiceID.IKEDC,
      'ekedc': VtpassElectricityServiceID.EKEDC,
      'kedco': VtpassElectricityServiceID.KEDCO,
      'phed': VtpassElectricityServiceID.PHED,
      'jed': VtpassElectricityServiceID.JED,
      'ibedc': VtpassElectricityServiceID.IBEDC,
      'kaedco': VtpassElectricityServiceID.KAEDCO,
      'aedc': VtpassElectricityServiceID.AEDC,
      'eedc': VtpassElectricityServiceID.EEDC,
      'bedc': VtpassElectricityServiceID.BEDC,
      'aba': VtpassElectricityServiceID.ABA,
      'yedc': VtpassElectricityServiceID.YEDC,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    if (!meterNumber || typeof meterNumber !== 'string') {
      return next(ApiError.badRequest('meterNumber is required'));
    }

    if (!meterType || (meterType !== 'prepaid' && meterType !== 'postpaid')) {
      return next(ApiError.badRequest('meterType is required and must be "prepaid" or "postpaid"'));
    }

    const result = await vtpassElectricityService.verifyMeter(serviceID, meterNumber, meterType);
    const content = result.content;

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        provider: normalizedProvider.toUpperCase(),
        meterType: meterType.toUpperCase(),
        customerInfo: {
          customerName: content.Customer_Name || null,
          address: content.Address || null,
          meterNumber: content.Meter_Number || content.MeterNumber || null,
          accountNumber: content.Account_Number || null,
          customerPhone: content.Customer_Phone || null,
          customerNumber: content.Customer_Number || null,
          accountType: content.Customer_Account_Type || null,
          district: content.Customer_District || null,
        },
        meterDetails: {
          meterType: content.Meter_Type || null,
          canVend: content.Can_Vend || null,
          minimumAmount: content.Minimum_Amount || content.Min_Purchase_Amount || null,
          maxAmount: content.MAX_Purchase_Amount || null,
          arrears: content.Customer_Arrears || null,
          businessUnit: content.Business_Unit || null,
          franchise: content.Franchise || null,
        },
        commissionDetails: content.commission_details || null,
        fullResponse: result,
      }, 'Meter verification completed')
    );
  } catch (error: any) {
    console.error('[VTPASS ELECTRICITY TEST] Verify Meter Error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify meter'));
  }
};

/**
 * Purchase Electricity (Prepaid or Postpaid)
 * POST /api/v2/test/vtpass/electricity/purchase
 */
export const purchaseElectricityController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { provider, meterNumber, meterType, amount, phone, request_id } = req.body;

    if (!provider || typeof provider !== 'string') {
      return next(ApiError.badRequest('Provider is required and must be a string'));
    }

    const validProviders: Record<string, string> = {
      'ikedc': VtpassElectricityServiceID.IKEDC,
      'ekedc': VtpassElectricityServiceID.EKEDC,
      'kedco': VtpassElectricityServiceID.KEDCO,
      'phed': VtpassElectricityServiceID.PHED,
      'jed': VtpassElectricityServiceID.JED,
      'ibedc': VtpassElectricityServiceID.IBEDC,
      'kaedco': VtpassElectricityServiceID.KAEDCO,
      'aedc': VtpassElectricityServiceID.AEDC,
      'eedc': VtpassElectricityServiceID.EEDC,
      'bedc': VtpassElectricityServiceID.BEDC,
      'aba': VtpassElectricityServiceID.ABA,
      'yedc': VtpassElectricityServiceID.YEDC,
    };

    const normalizedProvider = provider.toLowerCase();
    const serviceID = validProviders[normalizedProvider];

    if (!serviceID) {
      return next(ApiError.badRequest(`Invalid provider. Must be one of: ${Object.keys(validProviders).join(', ')}`));
    }

    if (!meterNumber || typeof meterNumber !== 'string') {
      return next(ApiError.badRequest('meterNumber is required'));
    }

    if (!meterType || (meterType !== 'prepaid' && meterType !== 'postpaid')) {
      return next(ApiError.badRequest('meterType is required and must be "prepaid" or "postpaid"'));
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return next(ApiError.badRequest('amount is required and must be a positive number'));
    }

    if (!phone || typeof phone !== 'string') {
      return next(ApiError.badRequest('phone is required'));
    }

    if (!/^0\d{10}$/.test(phone)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }

    const result = await vtpassElectricityService.purchaseElectricity(
      serviceID,
      meterNumber,
      meterType,
      amount,
      phone,
      request_id
    );

    // Extract token for prepaid meters
    const token = result.token || 
                  result.purchased_code?.replace(/^Token\s*:\s*/i, '') || 
                  result.mainToken || 
                  null;

    return res.status(200).json(
      new ApiResponse(200, {
        success: result.code === '000',
        code: result.code,
        message: result.response_description,
        provider: normalizedProvider.toUpperCase(),
        meterType: meterType.toUpperCase(),
        transaction: {
          requestId: result.requestId,
          transactionId: result.content?.transactions?.transactionId || null,
          status: result.content?.transactions?.status || null,
          amount: result.amount,
          commission: result.content?.transactions?.commission || null,
          totalAmount: result.content?.transactions?.total_amount || null,
        },
        ...(meterType === 'prepaid' ? {
          token: {
            token: token,
            tokenCode: result.purchased_code || null,
            tokenAmount: result.tokenAmount || result.mainsTokenAmount || null,
            units: result.units || result.mainTokenUnits || null,
            tariff: result.tariff || result.tariffCode || null,
          },
        } : {
          payment: {
            customerName: result.customerName || result.CustomerName || null,
            address: result.customerAddress || result.address || result.CustomerAddress || null,
            exchangeReference: result.exchangeReference || null,
            balance: result.balance || result.customerBalance || null,
          },
        }),
        meterInfo: {
          meterNumber: result.meterNumber || null,
          accountNumber: result.accountNumber || null,
          customerNumber: result.customerNumber || null,
        },
        fullResponse: result,
      }, `${meterType === 'prepaid' ? 'Electricity token' : 'Electricity bill'} purchase completed`)
    );
  } catch (error: any) {
    console.error('[VTPASS ELECTRICITY TEST] Purchase Error:', error);
    return next(ApiError.internal(error.message || 'Failed to purchase electricity'));
  }
};

/**
 * Query Transaction Status
 * POST /api/v2/test/vtpass/electricity/query
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

    const result = await vtpassElectricityService.queryTransactionStatus(request_id);

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
    console.error('[VTPASS ELECTRICITY TEST] Query Error:', error);
    return next(ApiError.internal(error.message || 'Failed to query transaction status'));
  }
};

/**
 * Get Test Information
 * GET /api/v2/test/vtpass/electricity/info
 */
export const getElectricityTestInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const providers = [
      {
        id: 'ikedc',
        name: 'IKEDC',
        fullName: 'Ikeja Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.IKEDC,
        coverage: 'Abule Egba, Akowonjo, Ikeja, Ikorodu, Oshodi, Shomolu (Lagos State)',
      },
      {
        id: 'ekedc',
        name: 'EKEDC',
        fullName: 'Eko Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.EKEDC,
        coverage: 'Apapa, Lekki, Ibeju, Island, Agbara, Ojo, Festac, Ijora, Mushin, Orile (Lagos State)',
      },
      {
        id: 'kedco',
        name: 'KEDCO',
        fullName: 'Kano Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.KEDCO,
        coverage: 'Kano, Katsina & Jigawa States',
      },
      {
        id: 'phed',
        name: 'PHED',
        fullName: 'Port Harcourt Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.PHED,
        coverage: 'Rivers, Bayelsa, Cross-River and Akwa-Ibom States',
      },
      {
        id: 'jed',
        name: 'JED',
        fullName: 'Jos Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.JED,
        coverage: 'Bauchi, Benue, Gombe & Plateau States',
      },
      {
        id: 'ibedc',
        name: 'IBEDC',
        fullName: 'Ibadan Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.IBEDC,
        coverage: 'Oyo, Ogun, Osun, Kwara, parts of Niger, Ekiti & Kogi States',
      },
      {
        id: 'kaedco',
        name: 'KAEDCO',
        fullName: 'Kaduna Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.KAEDCO,
        coverage: 'Kaduna, Kebbi, Sokoto and Zamfara States',
      },
      {
        id: 'aedc',
        name: 'AEDC',
        fullName: 'Abuja Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.AEDC,
        coverage: 'Federal Capital Territory (Abuja), Kogi, Niger, Nassarawa States',
      },
      {
        id: 'eedc',
        name: 'EEDC',
        fullName: 'Enugu Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.EEDC,
        coverage: 'Abia, Anambra, Ebonyi, Enugu and Imo States',
      },
      {
        id: 'bedc',
        name: 'BEDC',
        fullName: 'Benin Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.BEDC,
        coverage: 'Delta, Edo, Ekiti, and Ondo States',
      },
      {
        id: 'aba',
        name: 'ABA',
        fullName: 'Aba Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.ABA,
        coverage: 'Abia State',
      },
      {
        id: 'yedc',
        name: 'YEDC',
        fullName: 'Yola Electricity Distribution Company',
        serviceID: VtpassElectricityServiceID.YEDC,
        coverage: 'Adamawa, Taraba, Borno, & Yobe States',
      },
    ];

    const testScenarios = [
      {
        scenario: 'success_prepaid',
        meterNumber: '1111111111111',
        meterType: 'prepaid',
        description: 'Returns a successful response for testing prepaid meter purchases',
      },
      {
        scenario: 'success_postpaid',
        meterNumber: '1010101010101',
        meterType: 'postpaid',
        description: 'Returns a successful response for testing postpaid meter purchases',
      },
      {
        scenario: 'pending',
        meterNumber: '201000000000',
        description: 'Simulates an unexpected pending response',
      },
      {
        scenario: 'unexpected',
        meterNumber: '500000000000',
        description: 'Simulates an expected response, used to test how your system handles anomalies',
      },
      {
        scenario: 'noResponse',
        meterNumber: '400000000000',
        description: 'Simulates a scenario where the API returns no response',
      },
      {
        scenario: 'timeout',
        meterNumber: '300000000000',
        description: 'Simulates a timeout scenario for testing response handling under delays',
      },
    ];

    const endpoints = {
      verifyMeter: {
        method: 'POST',
        url: '/api/v2/test/vtpass/electricity/verify',
        description: 'Verify meter number before purchase',
        requiredFields: ['provider', 'meterNumber', 'meterType'],
        example: {
          provider: 'ikedc',
          meterNumber: '1111111111111',
          meterType: 'prepaid',
        },
      },
      purchase: {
        method: 'POST',
        url: '/api/v2/test/vtpass/electricity/purchase',
        description: 'Purchase electricity (prepaid generates token, postpaid pays bill)',
        requiredFields: ['provider', 'meterNumber', 'meterType', 'amount', 'phone'],
        example: {
          provider: 'ikedc',
          meterNumber: '1111111111111',
          meterType: 'prepaid',
          amount: 2000,
          phone: '08011111111',
        },
      },
      query: {
        method: 'POST',
        url: '/api/v2/test/vtpass/electricity/query',
        description: 'Query transaction status by request_id',
        requiredFields: ['request_id'],
        example: {
          request_id: '202503101430YUs83meikd',
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
          'Always verify meter number before purchase',
          'Prepaid meters generate tokens (display to customer, send via email/SMS)',
          'Postpaid meters pay bills directly',
          'Sandbox prepaid meter: 1111111111111',
          'Sandbox postpaid meter: 1010101010101',
          'Phone numbers must be 11 digits starting with 0',
          'Request ID format: YYYYMMDDHHII + alphanumeric suffix (Lagos timezone)',
          'Commission rates vary by provider and account type (MD/NMD)',
        ],
      }, 'Test information retrieved successfully')
    );
  } catch (error: any) {
    console.error('[VTPASS ELECTRICITY TEST] Info Error:', error);
    return next(ApiError.internal(error.message || 'Failed to get test information'));
  }
};

