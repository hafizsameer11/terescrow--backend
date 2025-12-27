/**
 * VTpass Cable TV Service
 * 
 * Handles cable TV subscription purchase and transaction status queries for all providers
 * Supports: DSTV, GOTV, Startimes, Showmax
 */

import axios from 'axios';
import { vtpassConfig } from './vtpass.config';
import {
  VtpassPurchaseResponse,
  VtpassQueryRequest,
  VtpassQueryResponse,
  VtpassCableServiceID,
  VtpassServiceVariationsResponse,
  VtpassCableVerifyRequest,
  VtpassDstvGotvVerifyResponse,
  VtpassStartimesVerifyResponse,
  VtpassCablePurchaseChangeRequest,
  VtpassCablePurchaseRenewRequest,
  VtpassCablePurchaseSimpleRequest,
} from '../../types/vtpass.types';

class VtpassCableService {
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
   * Get Service Variations (Bouquet Plans)
   */
  async getServiceVariations(
    serviceID: VtpassCableServiceID | string
  ): Promise<VtpassServiceVariationsResponse> {
    try {
      console.log(`[VTPASS CABLE] Get Variations Request (${serviceID}):`, {
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

      console.log(`[VTPASS CABLE] Get Variations Response (${serviceID}):`, {
        serviceName: response.data.content.ServiceName,
        variationsCount: variations.length,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS CABLE] Get Variations Error (${serviceID}):`, {
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
   * Verify Smartcard Number (DSTV, GOTV, Startimes)
   */
  async verifySmartcard(
    serviceID: VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV | VtpassCableServiceID.STARTIMES,
    smartcardNumber: string
  ): Promise<VtpassDstvGotvVerifyResponse | VtpassStartimesVerifyResponse> {
    const payload: VtpassCableVerifyRequest = {
      billersCode: smartcardNumber,
      serviceID,
    };

    try {
      console.log(`[VTPASS CABLE] Verify Smartcard Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/merchant-verify`,
        smartcardNumber: smartcardNumber.substring(0, 4) + '****',
      });

      const response = await axios.post<VtpassDstvGotvVerifyResponse | VtpassStartimesVerifyResponse>(
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

      console.log(`[VTPASS CABLE] Verify Smartcard Response (${serviceID}):`, {
        code: response.data.code,
        customerName: (response.data.content as any).Customer_Name,
        status: (response.data.content as any).Status || null,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS CABLE] Verify Smartcard Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to verify ${serviceID} smartcard`
        );
      }

      throw new Error(
        error.message || `Failed to verify ${serviceID} smartcard. Please try again.`
      );
    }
  }

  /**
   * Purchase Cable TV - Change Bouquet (DSTV, GOTV)
   */
  async purchaseChangeBouquet(
    serviceID: VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV,
    smartcardNumber: string,
    variation_code: string,
    phone: string,
    amount?: number,
    quantity?: number,
    requestId?: string
  ): Promise<VtpassPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassCablePurchaseChangeRequest = {
      request_id,
      serviceID,
      billersCode: smartcardNumber,
      variation_code,
      phone,
      subscription_type: 'change',
      ...(amount !== undefined && { amount }),
      ...(quantity !== undefined && { quantity }),
    };

    try {
      console.log(`[VTPASS CABLE] Purchase Change Bouquet Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: { 
          ...payload, 
          phone: phone.substring(0, 3) + '****',
          billersCode: smartcardNumber.substring(0, 4) + '****',
        },
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

      console.log(`[VTPASS CABLE] Purchase Change Bouquet Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS CABLE] Purchase Change Bouquet Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to purchase ${serviceID} change bouquet`
        );
      }

      throw new Error(
        error.message || `Failed to purchase ${serviceID} change bouquet. Please try again.`
      );
    }
  }

  /**
   * Purchase Cable TV - Renew Bouquet (DSTV, GOTV)
   */
  async purchaseRenewBouquet(
    serviceID: VtpassCableServiceID.DSTV | VtpassCableServiceID.GOTV,
    smartcardNumber: string,
    amount: number,
    phone: string,
    requestId?: string
  ): Promise<VtpassPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassCablePurchaseRenewRequest = {
      request_id,
      serviceID,
      billersCode: smartcardNumber,
      amount,
      phone,
      subscription_type: 'renew',
    };

    try {
      console.log(`[VTPASS CABLE] Purchase Renew Bouquet Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: { 
          ...payload, 
          phone: phone.substring(0, 3) + '****',
          billersCode: smartcardNumber.substring(0, 4) + '****',
        },
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

      console.log(`[VTPASS CABLE] Purchase Renew Bouquet Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS CABLE] Purchase Renew Bouquet Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to renew ${serviceID} bouquet`
        );
      }

      throw new Error(
        error.message || `Failed to renew ${serviceID} bouquet. Please try again.`
      );
    }
  }

  /**
   * Purchase Cable TV - Simple Purchase (DSTV, GOTV, Startimes, Showmax)
   * For DSTV/GOTV: Uses variation_code for purchase/change
   * For Startimes/Showmax: Uses variation_code for subscription
   */
  async purchaseSimple(
    serviceID: VtpassCableServiceID,
    billersCode: string,
    variation_code: string,
    phone: string,
    amount?: number,
    requestId?: string
  ): Promise<VtpassPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassCablePurchaseSimpleRequest = {
      request_id,
      serviceID,
      billersCode,
      variation_code,
      phone,
      ...(amount !== undefined && { amount }),
    };

    try {
      console.log(`[VTPASS CABLE] Purchase Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        payload: { 
          ...payload, 
          phone: phone.substring(0, 3) + '****',
          billersCode: billersCode.substring(0, 4) + '****',
        },
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

      console.log(`[VTPASS CABLE] Purchase Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS CABLE] Purchase Error (${serviceID}):`, {
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
      console.log('[VTPASS CABLE] Query Request:', {
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

      console.log('[VTPASS CABLE] Query Response:', {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS CABLE] Query Error:', {
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
  async getDstvVariations() {
    return this.getServiceVariations(VtpassCableServiceID.DSTV);
  }

  async getGotvVariations() {
    return this.getServiceVariations(VtpassCableServiceID.GOTV);
  }

  async getStartimesVariations() {
    return this.getServiceVariations(VtpassCableServiceID.STARTIMES);
  }

  async getShowmaxVariations() {
    return this.getServiceVariations(VtpassCableServiceID.SHOWMAX);
  }

  async verifyDstvSmartcard(smartcardNumber: string) {
    return this.verifySmartcard(VtpassCableServiceID.DSTV, smartcardNumber) as Promise<VtpassDstvGotvVerifyResponse>;
  }

  async verifyGotvSmartcard(smartcardNumber: string) {
    return this.verifySmartcard(VtpassCableServiceID.GOTV, smartcardNumber) as Promise<VtpassDstvGotvVerifyResponse>;
  }

  async verifyStartimesSmartcard(smartcardNumber: string) {
    return this.verifySmartcard(VtpassCableServiceID.STARTIMES, smartcardNumber) as Promise<VtpassStartimesVerifyResponse>;
  }
}

// Export singleton instance
export const vtpassCableService = new VtpassCableService();

