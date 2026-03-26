import axios from 'axios';
import {
  PalmPayPayoutRequest,
  PalmPayQueryPayStatusRequest,
  PalmPayBaseResponse,
  PalmPayPayoutResponse,
  PalmPayQueryPayStatusResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Payout Service
 * Handles automatic payouts (withdrawals)
 */
class PalmPayPayoutService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Initiate merchant payment (payout)
   */
  async initiatePayout(request: Omit<PalmPayPayoutRequest, 'requestTime' | 'version' | 'nonceStr'>): Promise<PalmPayPayoutResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    // Clean account number (remove spaces and special characters)
    const cleanAccountNo = request.payeeBankAccNo.replace(/\D/g, '');

    const fullRequest: PalmPayPayoutRequest = {
      ...request,
      payeeBankAccNo: cleanAccountNo,
      requestTime,
      version,
      nonceStr,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayPayoutResponse>>(
        `${this.baseUrl}/api/v2/merchant/payment/payout`,
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
   * Query payout status
   */
  async queryPayStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryPayStatusResponse> {
    if (!orderId && !orderNo) {
      throw new Error('Either orderId or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryPayStatusRequest = {
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
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryPayStatusResponse>>(
        `${this.baseUrl}/api/v2/merchant/payment/queryPayStatus`,
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
export const palmpayPayout = new PalmPayPayoutService();

