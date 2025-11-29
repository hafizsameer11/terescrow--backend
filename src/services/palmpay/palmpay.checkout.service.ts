import axios from 'axios';
import {
  PalmPayCreateOrderRequest,
  PalmPayQueryOrderRequest,
  PalmPayBaseResponse,
  PalmPayCreateOrderResponse,
  PalmPayQueryOrderResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Checkout Service
 * Handles deposit/pay-in operations (wallet top-up)
 */
class PalmPayCheckoutService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Create payment order for deposit
   */
  async createOrder(request: Omit<PalmPayCreateOrderRequest, 'requestTime' | 'version' | 'nonceStr'>): Promise<PalmPayCreateOrderResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const fullRequest: PalmPayCreateOrderRequest = {
      ...request,
      requestTime,
      version,
      nonceStr,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayCreateOrderResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/createorder`,
        fullRequest,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }

  /**
   * Query order status
   */
  async queryOrderStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryOrderResponse> {
    if (!orderId && !orderNo) {
      throw new Error('Either orderId or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryOrderRequest = {
      requestTime,
      version,
      nonceStr,
      ...(orderId && { orderId }),
      ...(orderNo && { orderNo }),
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryOrderResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/order/queryStatus`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const palmpayCheckout = new PalmPayCheckoutService();

