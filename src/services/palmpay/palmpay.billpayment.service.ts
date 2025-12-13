import axios from 'axios';
import {
  PalmPaySceneCode,
  PalmPayQueryBillerRequest,
  PalmPayBiller,
  PalmPayQueryItemRequest,
  PalmPayItem,
  PalmPayQueryRechargeAccountRequest,
  PalmPayQueryRechargeAccountResponse,
  PalmPayCreateBillOrderRequest,
  PalmPayCreateBillOrderResponse,
  PalmPayQueryBillOrderRequest,
  PalmPayQueryBillOrderResponse,
  PalmPayBaseResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import palmpayLogger from '../../utils/palmpay.logger';

/**
 * PalmPay Bill Payment Service
 * Handles bill payment operations (airtime, data, betting)
 */
class PalmPayBillPaymentService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Query Billers (Operators) for a scene code
   * POST /api/v2/bill-payment/biller/query
   */
  async queryBillers(sceneCode: PalmPaySceneCode): Promise<PalmPayBiller[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBillerRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
    };

    const signature = palmpayAuth.generateSignature(request);
    try {
      const response = await axios.post<PalmPayBiller[]>(
        `${this.baseUrl}/api/v2/bill-payment/biller/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query billers'
      );
    }
  }

  /**
   * Query Items (Packages) for a biller
   * POST /api/v2/bill-payment/item/query
   */
  async queryItems(
    sceneCode: PalmPaySceneCode,
    billerId: string
  ): Promise<PalmPayItem[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryItemRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
      billerId,
    };

    const signature = palmpayAuth.generateSignature(request);

    try {
      const response = await axios.post<PalmPayItem[]>(
        `${this.baseUrl}/api/v2/bill-payment/item/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/item/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/item/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query items'
      );
    }
  }

  /**
   * Query Recharge Account (Verify account)
   * POST /api/v2/bill-payment/rechargeaccount/query
   */
  async queryRechargeAccount(
    sceneCode: PalmPaySceneCode,
    rechargeAccount: string,
    billerId?: string,
    itemId?: string
  ): Promise<PalmPayQueryRechargeAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryRechargeAccountRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
      rechargeAccount,
      ...(billerId && { billerId }),
      ...(itemId && { itemId }),
    };

    const signature = palmpayAuth.generateSignature(request);

    try {
      const response = await axios.post<PalmPayQueryRechargeAccountResponse>(
        `${this.baseUrl}/api/v2/bill-payment/rechargeaccount/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query recharge account'
      );
    }
  }

  /**
   * Create Bill Payment Order
   * POST /api/v2/bill-payment/order/create
   */
  async createOrder(
    request: Omit<PalmPayCreateBillOrderRequest, 'requestTime' | 'version' | 'nonceStr'>
  ): Promise<PalmPayCreateBillOrderResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const fullRequest: PalmPayCreateBillOrderRequest = {
      ...request,
      requestTime,
      version,
      nonceStr,
    };

    const signature = palmpayAuth.generateSignature(fullRequest);
    const endpoint = `${this.baseUrl}/api/v2/bill-payment/order/create`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
      'Signature': signature,
      'CountryCode': palmpayConfig.getCountryCode(),
    };

    // Log complete request details to console
    console.log('\n========================================');
    console.log('[PALMPAY BILL PAYMENT] CREATE ORDER REQUEST');
    console.log('========================================');
    console.log('📡 Complete URL:', endpoint);
    console.log('🔑 Signature:', signature);
    console.log('📋 Request Headers:', JSON.stringify(headers, null, 2));
    console.log('📦 Request Body:', JSON.stringify(fullRequest, null, 2));
    console.log('========================================\n');

    // Log to file via logger
    palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayCreateBillOrderResponse>>(
        endpoint,
        fullRequest,
        { headers }
      );

      // Log complete response details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] CREATE ORDER RESPONSE');
      console.log('========================================');
      console.log('✅ Status Code:', response.status, response.statusText);
      console.log('📋 Response Headers:', JSON.stringify(response.headers, null, 2));
      console.log('📦 Full Response Body:', JSON.stringify(response.data, null, 2));
      console.log('🔍 Response Code:', response.data.respCode);
      console.log('💬 Response Message:', response.data.respMsg);
      if (response.data.data) {
        console.log('📊 Unwrapped Data:', JSON.stringify(response.data.data, null, 2));
      }
      console.log('========================================\n');

      // Check for errors in response
      if (response.data.respCode !== '00000000') {
        palmpayLogger.error('PalmPay createBillOrder - Error response', undefined, { 
          respCode: response.data.respCode,
          respMsg: response.data.respMsg,
          data: response.data.data
        });
        throw new Error(
          response.data.respMsg || 'Failed to create bill payment order'
        );
      }
      
      // Check if data exists
      if (!response.data.data) {
        palmpayLogger.error('PalmPay createBillOrder - No data in response', undefined, { response: response.data });
        throw new Error('PalmPay API returned no data');
      }
      
      // Log response for debugging (with both request and response)
      palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest, response.data);
      
      // Validate response data structure
      const orderData = response.data.data;
      if (!orderData.orderNo && orderData.orderStatus === undefined) {
        palmpayLogger.error('PalmPay createBillOrder - Invalid data structure', undefined, { orderData });
        throw new Error(
          orderData?.msg || response.data.respMsg || 'Invalid response from PalmPay'
        );
      }

      return orderData;
    } catch (error: any) {
      // Log complete error details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] CREATE ORDER ERROR');
      console.log('========================================');
      console.log('❌ Error Message:', error.message);
      console.log('📋 Error Stack:', error.stack);
      if (error.response) {
        console.log('📊 Response Status:', error.response.status, error.response.statusText);
        console.log('📋 Response Headers:', JSON.stringify(error.response.headers, null, 2));
        console.log('📦 Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.request) {
        console.log('📡 Request Details:', error.request);
      }
      console.log('========================================\n');

      palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest, undefined, error);
      const errorData = error.response?.data as any;
      throw new Error(
        errorData?.respMsg || 
        errorData?.msg || 
        error.message || 
        'Failed to create bill payment order'
      );
    }
  }

  /**
   * Query Bill Payment Order Status
   * POST /api/v2/bill-payment/order/query
   */
  async queryOrderStatus(
    sceneCode: PalmPaySceneCode,
    outOrderNo?: string,
    orderNo?: string
  ): Promise<PalmPayQueryBillOrderResponse> {
    if (!outOrderNo && !orderNo) {
      throw new Error('Either outOrderNo or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBillOrderRequest = {
      requestTime,
      version,
      nonceStr,
      sceneCode,
      ...(outOrderNo && { outOrderNo }),
      ...(orderNo && { orderNo }),
    };

    const signature = palmpayAuth.generateSignature(request);

    try {
      const response = await axios.post<PalmPayQueryBillOrderResponse>(
        `${this.baseUrl}/api/v2/bill-payment/order/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/order/queryOrderStatus', undefined, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/order/queryOrderStatus', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query order status'
      );
    }
  }
}

// Export singleton instance
export const palmpayBillPaymentService = new PalmPayBillPaymentService();

