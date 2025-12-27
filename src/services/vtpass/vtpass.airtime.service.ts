/**
 * VTpass Airtime Service
 * 
 * Handles airtime purchase and transaction status queries for all providers
 * Supports: MTN, GLO, Airtel, 9mobile (etisalat)
 */

import axios from 'axios';
import { vtpassConfig } from './vtpass.config';
import {
  VtpassPurchaseRequest,
  VtpassPurchaseResponse,
  VtpassQueryRequest,
  VtpassQueryResponse,
  VtpassAirtimeServiceID,
} from '../../types/vtpass.types';

class VtpassAirtimeService {
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
   * Purchase Airtime for any provider
   * 
   * @param serviceID - Service ID (mtn, glo, airtel, etisalat)
   * @param phone - Phone number to recharge (must start with 0)
   * @param amount - Amount to recharge (minimum usually 50)
   * @param requestId - Optional custom request ID, will generate if not provided
   * @returns Purchase response from VTpass
   */
  async purchaseAirtime(
    serviceID: VtpassAirtimeServiceID,
    phone: string,
    amount: number,
    requestId?: string
  ): Promise<VtpassPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassPurchaseRequest = {
      request_id,
      serviceID,
      amount,
      phone,
    };

    try {
      console.log(`[VTPASS AIRTIME] Purchase Request (${serviceID.toUpperCase()}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: { ...payload, phone: phone.substring(0, 3) + '****' }, // Mask phone for logging
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

      console.log(`[VTPASS AIRTIME] Purchase Response (${serviceID.toUpperCase()}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
        requestId: response.data.requestId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS AIRTIME] Purchase Error (${serviceID.toUpperCase()}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      // If error response has data, try to return it
      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to purchase ${serviceID.toUpperCase()} airtime`
        );
      }

      throw new Error(
        error.message || `Failed to purchase ${serviceID.toUpperCase()} airtime. Please try again.`
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
      console.log('[VTPASS AIRTIME] Query Request:', {
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

      console.log('[VTPASS AIRTIME] Query Response:', {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS AIRTIME] Query Error:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      // If error response has data, try to return it
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
  async purchaseMtnAirtime(phone: string, amount: number, requestId?: string) {
    return this.purchaseAirtime(VtpassAirtimeServiceID.MTN, phone, amount, requestId);
  }

  async purchaseGloAirtime(phone: string, amount: number, requestId?: string) {
    return this.purchaseAirtime(VtpassAirtimeServiceID.GLO, phone, amount, requestId);
  }

  async purchaseAirtelAirtime(phone: string, amount: number, requestId?: string) {
    return this.purchaseAirtime(VtpassAirtimeServiceID.AIRTEL, phone, amount, requestId);
  }

  async purchase9mobileAirtime(phone: string, amount: number, requestId?: string) {
    return this.purchaseAirtime(VtpassAirtimeServiceID.ETISALAT, phone, amount, requestId);
  }
}

// Export singleton instance
export const vtpassAirtimeService = new VtpassAirtimeService();

