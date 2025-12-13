import axios from 'axios';
import { execSync } from 'child_process';
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
    // Try V1.1 version for this endpoint (some PalmPay endpoints require V1.1 instead of V2)
    const version = 'V1.1';
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
    const config = palmpayConfig.getConfig();
    const endpoint = `${this.baseUrl}/api/v2/payment/merchant/payout/queryBankAccount`;

    // Prepare the exact JSON payload string (must match byte-for-byte)
    const payload = JSON.stringify({
      requestTime,
      version,
      nonceStr,
      bankCode,
      bankAccNo: cleanAccountNo,
    });

    try {
      console.log('queryBankAccount - Using curl for exact byte matching');
      console.log('Request payload:', payload);
      console.log('Endpoint:', endpoint);

      // Build curl command with exact payload
      // Escape single quotes in payload for shell safety
      const escapedPayload = payload.replace(/'/g, "'\"'\"'");
      
      const curlCommand = `curl --location '${endpoint}' ` +
        `--header 'Accept: application/json, text/plain, */*' ` +
        `--header 'CountryCode: ${config.countryCode}' ` +
        `--header 'Authorization: Bearer ${config.apiKey}' ` +
        `--header 'Signature: ${signature}' ` +
        `--header 'Content-Type: application/json' ` +
        `--data '${escapedPayload}'`;

      console.log('Executing curl command...');
      const curlOutput = execSync(curlCommand, { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }).trim();

      console.log('Curl response:', curlOutput);

      // Parse the JSON response
      const response = JSON.parse(curlOutput) as PalmPayBaseResponse<PalmPayQueryBankAccountResponse>;

      if (response.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.respMsg} (${response.respCode})`);
      }

      if (!response.data) {
        throw new Error('PalmPay API returned no data');
      }

      // Normalize the response - PalmPay returns Status (capital S) but our code expects status
      const responseData = response.data;
      if (responseData.Status && !responseData.status) {
        responseData.status = responseData.Status;
      }

      return responseData;
    } catch (error: any) {
      console.error('queryBankAccount curl error:', error);
      
      // If it's a parsing error, log the raw output
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        throw new Error(`Failed to parse PalmPay response: ${error.message}`);
      }

      // If execSync error, extract stderr
      if (error.stderr) {
        throw new Error(`Curl execution error: ${error.stderr.toString()}`);
      }

      throw new Error(error.message || 'Failed to query bank account');
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


