/**
 * Reloadly Airtime Service
 * Handles airtime top-ups via Reloadly API
 */

import axios from 'axios';
import { reloadlyConfig } from './reloadly.config';
import { reloadlyAuth } from './reloadly.auth.service';
import {
  ReloadlyOperator,
  ReloadlyOperatorsResponse,
  ReloadlyTopupRequest,
  ReloadlyTopupResponse,
  ReloadlyTopupStatusResponse,
} from '../../types/reloadly.types';

// Nigeria operators mapping (Reloadly operator names to our billerId format)
const NIGERIA_OPERATOR_MAPPING: Record<string, string> = {
  'MTN Nigeria': 'MTN',
  'Glo Nigeria': 'GLO',
  'Airtel Nigeria': 'AIRTEL',
  '9mobile Nigeria': '9MOBILE',
  '9Mobile': '9MOBILE',
  'Etisalat Nigeria': '9MOBILE',
};

// Reverse mapping (billerId to common operator name patterns)
const BILLER_ID_TO_OPERATOR_PATTERNS: Record<string, string[]> = {
  'MTN': ['MTN', 'mtn'],
  'GLO': ['Glo', 'GLO', 'glo'],
  'AIRTEL': ['Airtel', 'AIRTEL', 'airtel'],
  '9MOBILE': ['9mobile', '9Mobile', 'Etisalat', '9MOBILE'],
};

class ReloadlyAirtimeService {
  private baseUrl: string;
  private operatorsCache: ReloadlyOperator[] | null = null;
  private operatorsCacheTime: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.baseUrl = reloadlyConfig.getBaseUrl();
  }

  /**
   * Get Nigeria operators (cached for 1 hour)
   */
  async getNigeriaOperators(): Promise<ReloadlyOperator[]> {
    // Return cached operators if available
    if (this.operatorsCache && Date.now() < this.operatorsCacheTime) {
      return this.operatorsCache;
    }

    const token = await reloadlyAuth.getAccessToken();

    try {
      console.log('[RELOADLY AIRTIME] Fetching Nigeria operators...');

      const response = await axios.get<ReloadlyOperatorsResponse>(
        `${this.baseUrl}/operators/countries/NG`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            includeData: false, // We only need airtime operators
            includeBundles: false,
            includeCombo: false,
          },
          timeout: 30000,
        }
      );

      // Handle different response structures
      let operators: ReloadlyOperator[] = [];
      
      if (response.data) {
        if (Array.isArray(response.data)) {
          // Response is a direct array
          operators = response.data;
        } else if (response.data.content && Array.isArray(response.data.content)) {
          // Response has content array
          operators = response.data.content;
        } else {
          console.error('[RELOADLY AIRTIME] Unexpected response structure:', JSON.stringify(response.data, null, 2));
          throw new Error('Unexpected response structure from Reloadly API');
        }
      }

      if (!operators || operators.length === 0) {
        console.warn('[RELOADLY AIRTIME] No operators found in response');
        operators = []; // Return empty array instead of throwing error
      }

      this.operatorsCache = operators;
      this.operatorsCacheTime = Date.now() + this.CACHE_DURATION;

      console.log(`[RELOADLY AIRTIME] Found ${this.operatorsCache.length} Nigeria operators`);
      return this.operatorsCache;
    } catch (error: any) {
      console.error('[RELOADLY AIRTIME] Failed to fetch operators:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch Reloadly operators'
      );
    }
  }

  /**
   * Get operators mapped to billerId format
   */
  async getBillers(): Promise<Array<{ billerId: string; billerName: string; operatorId: number; operator: ReloadlyOperator }>> {
    const operators = await this.getNigeriaOperators();

    // Group operators by billerId (some operators might map to the same billerId)
    const billerMap = new Map<string, { billerId: string; billerName: string; operatorId: number; operator: ReloadlyOperator }>();

    for (const operator of operators) {
      // Try to match operator name to billerId
      let billerId: string | null = null;
      
      for (const [key, value] of Object.entries(NIGERIA_OPERATOR_MAPPING)) {
        if (operator.name.includes(key) || key.includes(operator.name)) {
          billerId = value;
          break;
        }
      }

      // If no direct match, try reverse lookup
      if (!billerId) {
        for (const [bId, patterns] of Object.entries(BILLER_ID_TO_OPERATOR_PATTERNS)) {
          if (patterns.some(pattern => operator.name.toLowerCase().includes(pattern.toLowerCase()))) {
            billerId = bId;
            break;
          }
        }
      }

      // Use mapped billerId or operator name as fallback
      const mappedBillerId = billerId || operator.name.toUpperCase().replace(/\s+/g, '_');
      
      // Keep the first operator for each billerId (prefer exact matches)
      if (!billerMap.has(mappedBillerId)) {
        billerMap.set(mappedBillerId, {
          billerId: mappedBillerId,
          billerName: operator.name,
          operatorId: operator.operatorId,
          operator,
        });
      }
    }

    return Array.from(billerMap.values());
  }

  /**
   * Find operator by billerId
   */
  async findOperatorByBillerId(billerId: string): Promise<ReloadlyOperator | null> {
    const billers = await this.getBillers();
    const biller = billers.find(b => b.billerId === billerId);
    return biller?.operator || null;
  }

  /**
   * Auto-detect operator from phone number
   */
  async autoDetectOperator(phone: string, countryCode: string = 'NG'): Promise<ReloadlyOperator | null> {
    const token = await reloadlyAuth.getAccessToken();

    try {
      // Remove leading + and country code from phone if present
      let phoneNumber = phone.replace(/^\+/, '').replace(/^234/, '');
      if (phoneNumber.startsWith('0')) {
        phoneNumber = phoneNumber.substring(1);
      }

      const response = await axios.get<ReloadlyOperator>(
        `${this.baseUrl}/operators/auto-detect/phone/${phoneNumber}/countries/${countryCode}`,
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
      console.error('[RELOADLY AIRTIME] Failed to auto-detect operator:', {
        error: error.message,
        response: error.response?.data,
      });
      return null;
    }
  }

  /**
   * Make airtime top-up
   */
  async makeTopup(
    operatorId: number,
    phone: string,
    amount: number,
    customIdentifier?: string
  ): Promise<ReloadlyTopupResponse> {
    const token = await reloadlyAuth.getAccessToken();

    // Format phone number (remove + and leading 0, add country code)
    let phoneNumber = phone.replace(/^\+/, '');
    if (phoneNumber.startsWith('234')) {
      phoneNumber = phoneNumber.substring(3);
    }
    if (phoneNumber.startsWith('0')) {
      phoneNumber = phoneNumber.substring(1);
    }

    const payload: ReloadlyTopupRequest = {
      operatorId,
      amount: amount.toFixed(2),
      recipientPhone: {
        countryCode: 'NG',
        number: phoneNumber,
      },
      ...(customIdentifier && { customIdentifier }),
    };

    try {
      console.log('[RELOADLY AIRTIME] Making top-up:', {
        operatorId,
        phone: phoneNumber.substring(0, 3) + '****',
        amount,
      });

      const response = await axios.post<ReloadlyTopupResponse>(
        `${this.baseUrl}/topups`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      console.log('[RELOADLY AIRTIME] Top-up successful:', {
        transactionId: response.data.transactionId,
        status: response.data.status,
      });

      return response.data;
    } catch (error: any) {
      console.error('[RELOADLY AIRTIME] Top-up failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.response?.data?.error?.message ||
        error.message ||
        'Failed to make Reloadly top-up'
      );
    }
  }

  /**
   * Get top-up status
   */
  async getTopupStatus(transactionId: number): Promise<ReloadlyTopupStatusResponse> {
    const token = await reloadlyAuth.getAccessToken();

    try {
      const response = await axios.get<ReloadlyTopupStatusResponse>(
        `${this.baseUrl}/topups/${transactionId}/status`,
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
      console.error('[RELOADLY AIRTIME] Failed to get top-up status:', {
        error: error.message,
        response: error.response?.data,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to get Reloadly top-up status'
      );
    }
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; currencyCode: string; currencyName: string }> {
    const token = await reloadlyAuth.getAccessToken();

    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/balance`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return {
        balance: response.data.balance,
        currencyCode: response.data.currencyCode,
        currencyName: response.data.currencyName,
      };
    } catch (error: any) {
      console.error('[RELOADLY AIRTIME] Failed to get balance:', {
        error: error.message,
        response: error.response?.data,
      });

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to get Reloadly account balance'
      );
    }
  }
}

export const reloadlyAirtimeService = new ReloadlyAirtimeService();

