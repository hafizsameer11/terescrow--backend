/**
 * Reloadly Orders Service
 * 
 * Handles all order-related API calls to Reloadly:
 * - Create order (purchase gift card)
 * - Get card codes by transaction ID
 * - Get transaction details
 */

import { reloadlyConfig } from './reloadly.config';
import { reloadlyGiftCardsAuth } from './reloadly.giftcards.auth.service';
import {
  ReloadlyOrderRequest,
  ReloadlyOrderResponse,
  ReloadlyCardCodesResponse,
  ReloadlyTransaction,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyOrdersService {
  private getBaseUrl() {
    // Gift cards use a different base URL than topups/airtime
    //  const environment = reloadlyConfig.getEnvironment();
    return 'https://giftcards.reloadly.com'
      // : 'https://giftcards-sandbox.reloadly.com';
  }

  /**
   * Create a new gift card order
   * POST https://giftcards.reloadly.com/orders
   * 
   * According to Reloadly official documentation
   */
  async createOrder(orderData: ReloadlyOrderRequest): Promise<ReloadlyOrderResponse> {
    try {
      const token = await reloadlyGiftCardsAuth.getAccessToken();
      const url = `${this.getBaseUrl()}/orders`;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/com.reloadly.giftcards-v1+json',
        'Content-Type': 'application/json',
      };

      // Log complete request object for debugging
      console.log('[RELOADLY ORDERS] Creating gift card order...');
      console.log('[RELOADLY ORDERS] Request URL:', url);
      console.log('[RELOADLY ORDERS] Request Headers:', JSON.stringify(headers, null, 2));
      console.log('[RELOADLY ORDERS] Complete Request Body:', JSON.stringify(orderData, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });

      // Log response status and headers
      console.log('[RELOADLY ORDERS] Response Status:', response.status);
      console.log('[RELOADLY ORDERS] Response Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      if (!response.ok) {
        const errorData: ReloadlyError = await response.json().catch(() => ({}));
        console.error('[RELOADLY ORDERS] Error Response:', JSON.stringify(errorData, null, 2));
        throw new Error(
          `Reloadly API error: ${errorData.error || errorData.message || response.statusText} (${response.status})`
        );
      }

      const data: ReloadlyOrderResponse = await response.json();
      console.log('[RELOADLY ORDERS] Success Response:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      console.error('[RELOADLY ORDERS] Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get card codes by transaction ID
   * This is the endpoint to get the actual gift card code after order completion
   */
  async getCardCodes(transactionId: number): Promise<ReloadlyCardCodesResponse> {
    try {
      const token = await reloadlyGiftCardsAuth.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/orders/transactions/${transactionId}/cards`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/com.reloadly.giftcards-v1+json',
        },
      });

      if (!response.ok) {
        const errorData: ReloadlyError = await response.json().catch(() => ({}));
        throw new Error(
          `Reloadly API error: ${errorData.error || errorData.message || response.statusText} (${response.status})`
        );
      }

      const data: ReloadlyCardCodesResponse = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching card codes for transaction ${transactionId}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction details by transaction ID
   */
  async getTransactionById(transactionId: number): Promise<ReloadlyTransaction> {
    try {
      const token = await reloadlyGiftCardsAuth.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/reports/transactions/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/com.reloadly.giftcards-v1+json',
        },
      });

      if (!response.ok) {
        const errorData: ReloadlyError = await response.json().catch(() => ({}));
        throw new Error(
          `Reloadly API error: ${errorData.error || errorData.message || response.statusText} (${response.status})`
        );
      }

      const data: ReloadlyTransaction = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching transaction ${transactionId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const reloadlyOrdersService = new ReloadlyOrdersService();

