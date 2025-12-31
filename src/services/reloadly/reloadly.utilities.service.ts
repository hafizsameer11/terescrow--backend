/**
 * Reloadly Utilities Service
 * Handles utility bill payments (Electricity, Water, TV, Internet) via Reloadly API
 */

import axios from 'axios';
import { reloadlyUtilitiesConfig } from './reloadly.utilities.config';
import { reloadlyUtilitiesAuth } from './reloadly.utilities.auth.service';
import {
  ReloadlyUtilityBiller,
  ReloadlyUtilityBillersResponse,
  ReloadlyPayUtilityRequest,
  ReloadlyPayUtilityResponse,
  ReloadlyUtilityTransactionResponse,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyUtilitiesService {
  private baseUrl: string;
  private billersCache: ReloadlyUtilityBiller[] | null = null;
  private billersCacheTime: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.baseUrl = reloadlyUtilitiesConfig.getBaseUrl();
  }

  /**
   * Get utility billers (cached for 1 hour)
   */
  async getBillers(params?: {
    type?: string;
    countryISOCode?: string;
    serviceType?: string;
    page?: number;
    size?: number;
  }): Promise<ReloadlyUtilityBiller[]> {
    // Return cached billers if available and no filters
    if (!params && this.billersCache && Date.now() < this.billersCacheTime) {
      return this.billersCache;
    }

    const token = await reloadlyUtilitiesAuth.getAccessToken();

    try {
      console.log('[RELOADLY UTILITIES] Fetching billers...');

      const response = await axios.get<ReloadlyUtilityBillersResponse>(
        `${this.baseUrl}/billers`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            ...params,
            size: params?.size || 200,
            page: params?.page || 1,
          },
          timeout: 30000,
        }
      );

      // Handle different response structures
      let billers: ReloadlyUtilityBiller[] = [];
      
      if (response.data) {
        if (Array.isArray(response.data)) {
          billers = response.data;
        } else if (response.data.content && Array.isArray(response.data.content)) {
          billers = response.data.content;
        } else {
          console.error('[RELOADLY UTILITIES] Unexpected response structure:', JSON.stringify(response.data, null, 2));
          throw new Error('Unexpected response structure from Reloadly Utilities API');
        }
      }

      if (!billers || billers.length === 0) {
        console.warn('[RELOADLY UTILITIES] No billers found in response');
        billers = [];
      }

      // Cache only if no filters
      if (!params) {
        this.billersCache = billers;
        this.billersCacheTime = Date.now() + this.CACHE_DURATION;
      }

      console.log(`[RELOADLY UTILITIES] Found ${billers.length} billers`);
      return billers;
    } catch (error: any) {
      console.error('[RELOADLY UTILITIES] Failed to fetch billers:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch Reloadly utility billers'
      );
    }
  }

  /**
   * Get Nigeria electricity billers
   */
  async getNigeriaElectricityBillers(): Promise<ReloadlyUtilityBiller[]> {
    return this.getBillers({
      type: 'ELECTRICITY_BILL_PAYMENT',
      countryISOCode: 'NG',
      size: 200,
    });
  }

  /**
   * Find biller by ID
   */
  async getBillerById(billerId: number): Promise<ReloadlyUtilityBiller | null> {
    const billers = await this.getBillers();
    return billers.find(b => b.id === billerId) || null;
  }

  /**
   * Pay utility bill
   */
  async payBill(request: ReloadlyPayUtilityRequest): Promise<ReloadlyPayUtilityResponse> {
    const token = await reloadlyUtilitiesAuth.getAccessToken();

    try {
      console.log('[RELOADLY UTILITIES] Paying utility bill...', {
        billerId: request.billerId,
        subscriberAccountNumber: request.subscriberAccountNumber,
        amount: request.amount,
      });

      const response = await axios.post<ReloadlyPayUtilityResponse>(
        `${this.baseUrl}/pay`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      // Log the exact full response from Reloadly
      console.log('[RELOADLY UTILITIES] Full response from Reloadly utility bill payment:', JSON.stringify(response.data, null, 2));
      console.log('[RELOADLY UTILITIES] Response status:', response.status);
      console.log('[RELOADLY UTILITIES] Response headers:', JSON.stringify(response.headers, null, 2));
      console.log('[RELOADLY UTILITIES] Bill payment initiated, transaction ID:', response.data.id);
      
      return response.data;
    } catch (error: any) {
      console.error('[RELOADLY UTILITIES] Failed to pay bill:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to pay utility bill'
      );
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: number): Promise<ReloadlyUtilityTransactionResponse> {
    const token = await reloadlyUtilitiesAuth.getAccessToken();

    try {
      const response = await axios.get<ReloadlyUtilityTransactionResponse>(
        `${this.baseUrl}/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return response.data;
    } catch (error: any) {
      console.error(`[RELOADLY UTILITIES] Failed to fetch transaction ${transactionId}:`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        `Failed to fetch transaction ${transactionId}`
      );
    }
  }

  /**
   * Get transactions with filters
   */
  async getTransactions(params?: {
    referenceId?: string;
    status?: string;
    serviceType?: string;
    billerType?: string;
    billerCountryCode?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    size?: number;
  }): Promise<ReloadlyUtilityTransactionResponse[]> {
    const token = await reloadlyUtilitiesAuth.getAccessToken();

    try {
      const response = await axios.get<ReloadlyUtilityTransactionResponse[]>(
        `${this.baseUrl}/transactions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            ...params,
            size: params?.size || 20,
            page: params?.page || 1,
          },
          timeout: 30000,
        }
      );

      // Handle both array and object responses
      if (Array.isArray(response.data)) {
        return response.data;
      }
      
      return [];
    } catch (error: any) {
      console.error('[RELOADLY UTILITIES] Failed to fetch transactions:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch transactions'
      );
    }
  }
}

export const reloadlyUtilitiesService = new ReloadlyUtilitiesService();

