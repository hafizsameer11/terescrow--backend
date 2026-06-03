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
import palmpayLogger from '../../utils/palmpay.logger';

const CREATE_ORDER_PATH = '/api/v2/payment/merchant/createorder';
const QUERY_ORDER_PATH = '/api/v2/payment/merchant/order/queryStatus';

function checkoutUrl(path: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function logCheckoutApiError(
  operation: string,
  url: string,
  context: Record<string, unknown>,
  error?: unknown
): void {
  const payload = { url, ...context };
  if (error instanceof Error) {
    palmpayLogger.error(`PalmPay checkout ${operation}`, error, payload);
  } else {
    palmpayLogger.error(`PalmPay checkout ${operation}`, undefined, payload);
  }
  console.error(`[PALMPAY CHECKOUT] ${operation} failed`, payload);
}

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

    const signature = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(signature);
    const url = checkoutUrl(CREATE_ORDER_PATH, this.baseUrl);

    try {
      palmpayLogger.apiCall(url, {
        orderId: fullRequest.orderId,
        amount: fullRequest.amount,
        currency: fullRequest.currency,
        productType: fullRequest.productType,
      });

      const response = await axios.post<PalmPayBaseResponse<PalmPayCreateOrderResponse>>(
        url,
        fullRequest,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        logCheckoutApiError('createOrder', url, {
          respCode: response.data.respCode,
          respMsg: response.data.respMsg,
          orderId: fullRequest.orderId,
          amount: fullRequest.amount,
          productType: fullRequest.productType,
          environment: palmpayConfig.getEnvironment(),
        });
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        logCheckoutApiError('createOrder', url, {
          orderId: fullRequest.orderId,
          reason: 'empty_data',
        });
        throw new Error('PalmPay API returned no data');
      }

      palmpayLogger.apiCall(url, { orderId: fullRequest.orderId }, response.data);
      return response.data.data;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith('PalmPay API error:')) {
        throw error;
      }
      const axiosErr = error as { response?: { data?: { respMsg?: string; respCode?: string } }; message?: string };
      if (axiosErr.response) {
        logCheckoutApiError('createOrder', url, {
          respCode: axiosErr.response.data?.respCode ?? 'UNKNOWN',
          respMsg: axiosErr.response.data?.respMsg ?? axiosErr.message,
          orderId: fullRequest.orderId,
          amount: fullRequest.amount,
          productType: fullRequest.productType,
        }, error);
        throw new Error(
          `PalmPay API error: ${axiosErr.response.data?.respMsg || axiosErr.message} (${axiosErr.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      logCheckoutApiError('createOrder', url, { orderId: fullRequest.orderId }, error);
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

    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);
    const url = checkoutUrl(QUERY_ORDER_PATH, this.baseUrl);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryOrderResponse>>(
        url,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        logCheckoutApiError('queryOrderStatus', url, {
          respCode: response.data.respCode,
          respMsg: response.data.respMsg,
          orderId,
          orderNo,
        });
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        logCheckoutApiError('queryOrderStatus', url, { orderId, orderNo, reason: 'empty_data' });
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith('PalmPay API error:')) {
        throw error;
      }
      const axiosErr = error as { response?: { data?: { respMsg?: string; respCode?: string } }; message?: string };
      if (axiosErr.response) {
        logCheckoutApiError('queryOrderStatus', url, {
          respCode: axiosErr.response.data?.respCode ?? 'UNKNOWN',
          respMsg: axiosErr.response.data?.respMsg ?? axiosErr.message,
          orderId,
          orderNo,
        }, error);
        throw new Error(
          `PalmPay API error: ${axiosErr.response.data?.respMsg || axiosErr.message} (${axiosErr.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      logCheckoutApiError('queryOrderStatus', url, { orderId, orderNo }, error);
      throw error;
    }
  }
}

// Export singleton instance
export const palmpayCheckout = new PalmPayCheckoutService();
