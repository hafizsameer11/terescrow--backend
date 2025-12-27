/**
 * VTpass Data Service
 * 
 * Handles data subscription purchase and transaction status queries for all providers
 * Supports: MTN, GLO, Airtel, 9mobile (etisalat), GLO SME, Smile
 */

import axios from 'axios';
import { vtpassConfig } from './vtpass.config';
import {
  VtpassPurchaseDataRequest,
  VtpassPurchaseResponse,
  VtpassQueryRequest,
  VtpassQueryResponse,
  VtpassDataServiceID,
  VtpassServiceVariationsResponse,
  VtpassSmileVerifyRequest,
  VtpassSmileVerifyResponse,
} from '../../types/vtpass.types';

class VtpassDataService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = vtpassConfig.getBaseUrl();
  }

  /**
   * Generate a unique request ID
   * Format: YYYYMMDDHHII + alphanumeric string
   * Requirements:
   * - MUST BE 12 CHARACTERS OR MORE
   * - FIRST 12 CHARACTERS MUST BE NUMERIC
   * - FIRST 12 CHARACTERS MUST COMPRISE OF TODAY'S DATE
   * - Date and Time should be in Africa/Lagos Timezone (GMT +1)
   * 
   * Example: "202202071830YUs83meikd"
   */
  generateRequestId(): string {
    // Get current date/time in Africa/Lagos timezone (GMT +1)
    const now = new Date();
    const lagosOffset = 1 * 60; // GMT +1 in minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const lagosTime = new Date(utc + (lagosOffset * 60000));
    
    // Format: YYYYMMDDHHII (12 digits)
    const year = lagosTime.getFullYear();
    const month = String(lagosTime.getMonth() + 1).padStart(2, '0');
    const day = String(lagosTime.getDate()).padStart(2, '0');
    const hours = String(lagosTime.getHours()).padStart(2, '0');
    const minutes = String(lagosTime.getMinutes()).padStart(2, '0');
    
    const dateTimePart = `${year}${month}${day}${hours}${minutes}`; // 12 digits
    
    // Generate random alphanumeric suffix (at least 8 characters for uniqueness)
    const randomSuffix = Math.random().toString(36).substring(2, 18).replace(/[^a-zA-Z0-9]/g, '');
    
    return `${dateTimePart}${randomSuffix}`;
  }

  /**
   * Get Service Variations (Data Plans)
   * 
   * @param serviceID - Service ID (e.g., "mtn-data", "glo-data", "airtel-data", "etisalat-data", "glo-sme-data", "smile-direct")
   * @returns List of available data plans/variations
   */
  async getServiceVariations(
    serviceID: VtpassDataServiceID | string
  ): Promise<VtpassServiceVariationsResponse> {
    try {
      console.log(`[VTPASS DATA] Get Variations Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/service-variations?serviceID=${serviceID}`,
      });

      const response = await axios.get<VtpassServiceVariationsResponse>(
        `${this.baseUrl}/service-variations`,
        {
          params: {
            serviceID,
          },
          headers: {
            'api-key': vtpassConfig.getApiKey(),
            'public-key': vtpassConfig.getPublicKey(),
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      // Handle both "variations" and "varations" (typo in API)
      const variations = response.data.content.variations || response.data.content.varations || [];

      console.log(`[VTPASS DATA] Get Variations Response (${serviceID}):`, {
        serviceName: response.data.content.ServiceName,
        variationsCount: variations.length,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS DATA] Get Variations Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to get variations for ${serviceID}`
        );
      }

      throw new Error(
        error.message || `Failed to get variations for ${serviceID}. Please try again.`
      );
    }
  }

  /**
   * Purchase Data Bundle
   * 
   * @param serviceID - Service ID (e.g., "mtn-data", "glo-data")
   * @param billersCode - Phone number or account ID for subscription
   * @param variation_code - Variation code from service-variations
   * @param phone - Phone number of customer/recipient
   * @param amount - Optional amount (ignored, variation_code determines price)
   * @param requestId - Optional custom request ID
   * @returns Purchase response from VTpass
   */
  async purchaseData(
    serviceID: VtpassDataServiceID | string,
    billersCode: string,
    variation_code: string,
    phone: string,
    amount?: number,
    requestId?: string
  ): Promise<VtpassPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassPurchaseDataRequest = {
      request_id,
      serviceID,
      billersCode,
      variation_code,
      phone,
      ...(amount !== undefined && { amount }),
    };

    try {
      console.log(`[VTPASS DATA] Purchase Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: { 
          ...payload, 
          phone: phone.substring(0, 3) + '****',
          billersCode: billersCode.substring(0, 3) + '****',
        }, // Mask sensitive data for logging
      });

      const response = await axios.post<VtpassPurchaseResponse>(
        `${this.baseUrl}/pay`,
        payload,
        {
          headers: {
            'api-key': vtpassConfig.getApiKey(),
            'secret-key': vtpassConfig.getSecretKey(),
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      console.log(`[VTPASS DATA] Purchase Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
        requestId: response.data.requestId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS DATA] Purchase Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to purchase ${serviceID} data`
        );
      }

      throw new Error(
        error.message || `Failed to purchase ${serviceID} data. Please try again.`
      );
    }
  }

  /**
   * Verify Smile Email (only for Smile provider)
   * 
   * @param email - Smile email address
   * @returns Verification response with account list
   */
  async verifySmileEmail(email: string): Promise<VtpassSmileVerifyResponse> {
    const payload: VtpassSmileVerifyRequest = {
      billersCode: email,
      serviceID: 'smile-direct',
    };

    try {
      console.log('[VTPASS DATA] Verify Smile Email Request:', {
        endpoint: `${this.baseUrl}/merchant-verify/smile/email`,
        email: email.substring(0, 3) + '****', // Mask email for logging
      });

      // VTpass uses Basic Auth for Smile verification
      const username = vtpassConfig.getApiKey(); // VTpass email
      const password = vtpassConfig.getPublicKey(); // VTpass password (using public key for Basic Auth)
      const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

      const response = await axios.post<VtpassSmileVerifyResponse>(
        `${this.baseUrl}/merchant-verify/smile/email`,
        payload,
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[VTPASS DATA] Verify Smile Email Response:', {
        code: response.data.code,
        customerName: response.data.content?.Customer_Name,
        accountsCount: response.data.content?.AccountList?.NumberOfAccounts,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS DATA] Verify Smile Email Error:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          'Failed to verify Smile email'
        );
      }

      throw new Error(
        error.message || 'Failed to verify Smile email. Please try again.'
      );
    }
  }

  /**
   * Query Transaction Status
   * 
   * @param requestId - The request_id used when purchasing
   * @returns Transaction status response from VTpass
   */
  async queryTransactionStatus(requestId: string): Promise<VtpassQueryResponse> {
    const payload: VtpassQueryRequest = {
      request_id: requestId,
    };

    try {
      console.log('[VTPASS DATA] Query Request:', {
        endpoint: `${this.baseUrl}/requery`,
        requestId,
      });

      const response = await axios.post<VtpassQueryResponse>(
        `${this.baseUrl}/requery`,
        payload,
        {
          headers: {
            'api-key': vtpassConfig.getApiKey(),
            'secret-key': vtpassConfig.getSecretKey(),
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[VTPASS DATA] Query Response:', {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS DATA] Query Error:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          'Failed to query transaction status'
        );
      }

      throw new Error(
        error.message || 'Failed to query transaction status. Please try again.'
      );
    }
  }

  /**
   * Convenience methods for each provider
   */
  async getMtnDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.MTN);
  }

  async getGloDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.GLO);
  }

  async getAirtelDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.AIRTEL);
  }

  async get9mobileDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.ETISALAT);
  }

  async getGloSmeDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.GLO_SME);
  }

  async getSmileDataVariations() {
    return this.getServiceVariations(VtpassDataServiceID.SMILE);
  }

  async purchaseMtnData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.MTN, billersCode, variation_code, phone, amount, requestId);
  }

  async purchaseGloData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.GLO, billersCode, variation_code, phone, amount, requestId);
  }

  async purchaseAirtelData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.AIRTEL, billersCode, variation_code, phone, amount, requestId);
  }

  async purchase9mobileData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.ETISALAT, billersCode, variation_code, phone, amount, requestId);
  }

  async purchaseGloSmeData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.GLO_SME, billersCode, variation_code, phone, amount, requestId);
  }

  async purchaseSmileData(billersCode: string, variation_code: string, phone: string, amount?: number, requestId?: string) {
    return this.purchaseData(VtpassDataServiceID.SMILE, billersCode, variation_code, phone, amount, requestId);
  }
}

// Export singleton instance
export const vtpassDataService = new VtpassDataService();

