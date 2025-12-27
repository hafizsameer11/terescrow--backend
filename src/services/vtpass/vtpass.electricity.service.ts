/**
 * VTpass Electricity Service
 * 
 * Handles electricity bill payment and transaction status queries for all providers
 * Supports: IKEDC, EKEDC, KEDCO, PHED, JED
 */

import axios from 'axios';
import { vtpassConfig } from './vtpass.config';
import {
  VtpassElectricityPurchaseRequest,
  VtpassElectricityPurchaseResponse,
  VtpassQueryRequest,
  VtpassQueryResponse,
  VtpassElectricityServiceID,
  VtpassElectricityVerifyRequest,
  VtpassElectricityVerifyResponse,
} from '../../types/vtpass.types';

// Re-export for convenience
export { VtpassElectricityServiceID };

class VtpassElectricityService {
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
   * Verify Meter Number
   * Verifies prepaid or postpaid meter before purchase
   */
  async verifyMeter(
    serviceID: VtpassElectricityServiceID | string,
    meterNumber: string,
    meterType: 'prepaid' | 'postpaid'
  ): Promise<VtpassElectricityVerifyResponse> {
    const payload: VtpassElectricityVerifyRequest = {
      billersCode: meterNumber,
      serviceID,
      type: meterType,
    };

    try {
      console.log(`[VTPASS ELECTRICITY] Verify Meter Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/merchant-verify`,
        meterType,
        meterNumber: meterNumber.substring(0, 4) + '****',
      });

      const response = await axios.post<VtpassElectricityVerifyResponse>(
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

      const content = response.data.content;

      console.log(`[VTPASS ELECTRICITY] Verify Meter Response (${serviceID}):`, {
        code: response.data.code,
        customerName: content.Customer_Name || null,
        meterType: content.Meter_Type || null,
        meterNumber: content.Meter_Number || content.MeterNumber || null,
        address: content.Address || null,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS ELECTRICITY] Verify Meter Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to verify ${serviceID} meter`
        );
      }

      throw new Error(
        error.message || `Failed to verify ${serviceID} meter. Please try again.`
      );
    }
  }

  /**
   * Purchase Electricity (Prepaid or Postpaid)
   * For prepaid: generates token
   * For postpaid: pays bill
   */
  async purchaseElectricity(
    serviceID: VtpassElectricityServiceID | string,
    meterNumber: string,
    meterType: 'prepaid' | 'postpaid',
    amount: number,
    phone: string,
    requestId?: string
  ): Promise<VtpassElectricityPurchaseResponse> {
    const request_id = requestId || this.generateRequestId();

    const payload: VtpassElectricityPurchaseRequest = {
      request_id,
      serviceID,
      billersCode: meterNumber,
      variation_code: meterType,
      amount,
      phone,
    };

    try {
      console.log(`[VTPASS ELECTRICITY] Purchase Request (${serviceID}):`, {
        endpoint: `${this.baseUrl}/pay`,
        meterType,
        payload: {
          ...payload,
          phone: phone.substring(0, 3) + '****',
          billersCode: meterNumber.substring(0, 4) + '****',
        },
      });

      const response = await axios.post<VtpassElectricityPurchaseResponse>(
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

      console.log(`[VTPASS ELECTRICITY] Purchase Response (${serviceID}):`, {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
        token: response.data.token || response.data.purchased_code || null,
      });

      return response.data;
    } catch (error: any) {
      console.error(`[VTPASS ELECTRICITY] Purchase Error (${serviceID}):`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.data) {
        throw new Error(
          error.response.data.response_description ||
          error.response.data.message ||
          error.message ||
          `Failed to purchase ${serviceID} electricity`
        );
      }

      throw new Error(
        error.message || `Failed to purchase ${serviceID} electricity. Please try again.`
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
      console.log('[VTPASS ELECTRICITY] Query Request:', {
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

      console.log('[VTPASS ELECTRICITY] Query Response:', {
        code: response.data.code,
        response_description: response.data.response_description,
        status: response.data.content?.transactions?.status,
        transactionId: response.data.content?.transactions?.transactionId,
      });

      return response.data;
    } catch (error: any) {
      console.error('[VTPASS ELECTRICITY] Query Error:', {
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
  async verifyIkedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.IKEDC, meterNumber, meterType);
  }

  async verifyEkedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.EKEDC, meterNumber, meterType);
  }

  async verifyKedcoMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.KEDCO, meterNumber, meterType);
  }

  async verifyPhedMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.PHED, meterNumber, meterType);
  }

  async verifyJedMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.JED, meterNumber, meterType);
  }

  async purchaseIkedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.IKEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseEkedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.EKEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseKedco(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.KEDCO, meterNumber, meterType, amount, phone, requestId);
  }

  async purchasePhed(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.PHED, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseJed(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.JED, meterNumber, meterType, amount, phone, requestId);
  }

  async verifyIbedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.IBEDC, meterNumber, meterType);
  }

  async verifyKaedcoMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.KAEDCO, meterNumber, meterType);
  }

  async verifyAedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.AEDC, meterNumber, meterType);
  }

  async verifyEedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.EEDC, meterNumber, meterType);
  }

  async verifyBedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.BEDC, meterNumber, meterType);
  }

  async verifyAbaMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.ABA, meterNumber, meterType);
  }

  async verifyYedcMeter(meterNumber: string, meterType: 'prepaid' | 'postpaid') {
    return this.verifyMeter(VtpassElectricityServiceID.YEDC, meterNumber, meterType);
  }

  async purchaseIbedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.IBEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseKaedco(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.KAEDCO, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseAedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.AEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseEedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.EEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseBedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.BEDC, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseAba(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.ABA, meterNumber, meterType, amount, phone, requestId);
  }

  async purchaseYedc(meterNumber: string, meterType: 'prepaid' | 'postpaid', amount: number, phone: string, requestId?: string) {
    return this.purchaseElectricity(VtpassElectricityServiceID.YEDC, meterNumber, meterType, amount, phone, requestId);
  }
}

// Export singleton instance
export const vtpassElectricityService = new VtpassElectricityService();

