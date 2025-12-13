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
    palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', request);
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

      palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', undefined, response.data);
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

      palmpayLogger.apiCall('/api/v2/bill-payment/item/query', undefined, response.data);
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
      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', request);
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

      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', undefined, response.data);
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

    palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest);
    const signature = palmpayAuth.generateSignature(fullRequest);

    try {
      const response = await axios.post<PalmPayCreateBillOrderResponse>(
        `${this.baseUrl}/api/v2/bill-payment/order/create`,
        fullRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      // Log response for debugging
      palmpayLogger.apiCall('/api/v2/bill-payment/order/create', undefined, response.data);
      
      // Check if response has error structure
      const responseData = response.data as any;
      if (responseData && !responseData.orderNo && !responseData.orderStatus) {
        palmpayLogger.error('PalmPay createBillOrder - Invalid response structure', undefined, { responseData });
        throw new Error(
          responseData?.respMsg || responseData?.msg || 'Invalid response from PalmPay'
        );
      }

      return response.data;
    } catch (error: any) {
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

