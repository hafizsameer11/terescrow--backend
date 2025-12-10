import axios from 'axios';
import {
  PalmPayQueryBankListRequest,
  PalmPayQueryBankAccountRequest,
  PalmPayQueryAccountRequest,
  PalmPayBaseResponse,
  PalmPayBankInfo,
  PalmPayQueryBankAccountResponse,
  PalmPayQueryAccountResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Banks Service
 * Handles bank list queries and account verification
 */
class PalmPayBanksService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Query bank list
   * @param businessType - 0 = all
   */
  async queryBankList(businessType: number = 0): Promise<PalmPayBankInfo[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBankListRequest = {
      requestTime,
      version,
      nonceStr,
      businessType,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayBankInfo[]>>(
        `${this.baseUrl}/api/v2/general/merchant/queryBankList`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      // Handle both array and single object responses
      if (Array.isArray(response.data.data)) {
        return response.data.data;
      } else if (response.data.data) {
        // If single object, return as array
        return [response.data.data];
      }

      return [];
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
   * Query bank account (verify account name)
   * Note: For PalmPay account (bankCode "100033"), use queryAccount instead
   */
  async queryBankAccount(bankCode: string, bankAccNo: string): Promise<PalmPayQueryBankAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    // Remove spaces and special characters from account number
    const cleanAccountNo = bankAccNo.replace(/\D/g, '');

    const request: PalmPayQueryBankAccountRequest = {
      requestTime,
      version,
      nonceStr,
      bankCode,
      bankAccNo: cleanAccountNo,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      console.log('request palmpay banks service', request,'signature', signature);
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryBankAccountResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/payout/queryBankAccount`,
        request,
        { headers }
      );
      console.log('response palmpay banks service', response.data);
      if (response.data.respCode !== '00000000') {
        console.log('response palmpay banks service error', response.data);
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }
      console.log('response palmpay banks service data', response.data.data);
      if (!response.data.data) {
      
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        console.log('response palmpay banks service error', error.response.data);
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }

  /**
   * Query PalmPay account
   * Use this for PalmPay account verification (bankCode "100033")
   */
  async queryAccount(palmpayAccNo: string): Promise<PalmPayQueryAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryAccountRequest = {
      requestTime,
      version,
      nonceStr,
      palmpayAccNo,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryAccountResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/payout/queryAccount`,
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
export const palmpayBanks = new PalmPayBanksService();

