/**
 * VTpass Education Service
 * 
 * Handles education services (WAEC Registration, WAEC Result Checker, JAMB)
 */

import axios from 'axios';
import { vtpassConfig } from './vtpass.config';
import {
  VtpassEducationPurchaseRequest,
  VtpassEducationPurchaseResponse,
  VtpassQueryRequest,
  VtpassQueryResponse,
  VtpassEducationServiceID,
  VtpassServiceVariationsResponse,
  VtpassJambVerifyRequest,
  VtpassJambVerifyResponse,
} from '../../types/vtpass.types';

class VtpassEducationService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = vtpassConfig.getBaseUrl();
  }

  /**
   * Generate a unique request ID
   * Format: YYYYMMDDHHII + alphanumeric string
   */
  generateRequestId(): string {
    const now = new Date();
    const lagosOffset = 1 * 60; // GMT +1 in minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const lagosTime = new Date(utc + (lagosOffset * 60000));
    
    const year = lagosTime.getFullYear();
    const month = String(lagosTime.getMonth() + 1).padStart(2, '0');
    const day = String(lagosTime.getDate()).padStart(2, '0');
    const hours = String(lagosTime.getHours()).padStart(2, '0');
    const minutes = String(lagosTime.getMinutes()).padStart(2, '0');
    
    const dateTimePart = `${year}${month}${day}${hours}${minutes}`;
    const randomSuffix = Math.random().toString(36).substring(2, 18).replace(/[^a-zA-Z0-9]/g, '');
    
    return `${dateTimePart}${randomSuffix}`;
  }

  /**
   * Get Service Variations
   */
  async getServiceVariations(
    serviceID: VtpassEducationServiceID | string
  ): Promise<VtpassServiceVariationsResponse> {
    try {
      console.log(`[VTPASS EDUCATION] Get Variations Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/service-variations?serviceID=${serviceID}`,
      });

      const response = await axios.get<VtpassServiceVariationsResponse>(
        `${this.baseUrl}/service-variations`,
        {
          params: { serviceID },
          headers: {
            'api-key': vtpassConfig.getApiKey(),
            'secret-key': vtpassConfig.getSecretKey(),
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const variations = response.data.content.variations || response.data.content.varations || [];

      console.log(`[VTPASS EDUCATION] Get Variations Response (${serviceID}):`, {
        serviceName: response.data.content.ServiceName,
        variationsCount: variations.length,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS EDUCATION] Get Variations Error (${serviceID}):`, {
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
   * Verify JAMB Profile ID
   */
  async verifyJambProfile(
    profileId: string,
    variationCode: string
  ): Promise<VtpassJambVerifyResponse> {
    const payload: VtpassJambVerifyRequest = {
      billersCode: profileId,
      serviceID: VtpassEducationServiceID.JAMB,
      type: variationCode,
    };

    try {
      console.log('[VTPASS EDUCATION] Verify JAMB Profile Request:', {
        endpoint: `${this.baseUrl}/merchant-verify`,
        profileId: profileId.substring(0, 4) + '****',
      });

      const response = await axios.post<VtpassJambVerifyResponse>(
        `${this.baseUrl}/merchant-verify`,
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

      console.log('[VTPASS EDUCATION] Verify JAMB Profile Response:', {
        code: response.data.code,
        customerName: response.data.content.Customer_Name,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS EDUCATION] Verify JAMB Profile Error:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          'Failed to verify JAMB profile'
        );
      }

      throw new Error(
        error.message || 'Failed to verify JAMB profile. Please try again.'
      );
    }
  }

  /**
   * Purchase Education Service (WAEC Registration, WAEC Result Checker, JAMB)
   */
  async purchaseEducation(
    serviceID: VtpassEducationServiceID | string,
    variation_code: string,
    phone: string,
    profileId?: string, // Required for JAMB
    quantity?: number,
    amount?: number,
    requestId?: string
  ): Promise<VtpassEducationPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassEducationPurchaseRequest = {
      request_id,
      serviceID,
      variation_code,
      phone,
      ...(quantity !== undefined && { quantity }),
      ...(amount !== undefined && { amount }),
      ...(profileId && { billersCode: profileId }),
    };

    try {
      console.log(`[VTPASS EDUCATION] Purchase Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: {
          ...payload,
          phone: phone.substring(0, 3) + '****',
          ...(profileId && { billersCode: profileId.substring(0, 4) + '****' }),
        },
      });

      const response = await axios.post<VtpassEducationPurchaseResponse>(
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

      console.log(`[VTPASS EDUCATION] Purchase Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS EDUCATION] Purchase Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to purchase ${serviceID}`
        );
      }

      throw new Error(
        error.message || `Failed to purchase ${serviceID}. Please try again.`
      );
    }
  }

  /**
   * Query Transaction Status
   */
  async queryTransactionStatus(requestId: string): Promise<VtpassQueryResponse> {
    const payload: VtpassQueryRequest = {
      request_id: requestId,
    };

    try {
      console.log('[VTPASS EDUCATION] Query Request:', {
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

      console.log('[VTPASS EDUCATION] Query Response:', {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS EDUCATION] Query Error:', {
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
}

// Export singleton instance
export const vtpassEducationService = new VtpassEducationService();

