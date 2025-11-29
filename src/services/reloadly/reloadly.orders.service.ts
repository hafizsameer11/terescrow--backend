/**
 * Reloadly Orders Service
 * 
 * Handles all order-related API calls to Reloadly:
 * - Create order (purchase gift card)
 * - Get card codes by transaction ID
 * - Get transaction details
 */

import { reloadlyConfig } from './reloadly.config';
import { reloadlyAuthService } from './reloadly.auth.service';
import {
  ReloadlyOrderRequest,
  ReloadlyOrderResponse,
  ReloadlyCardCodesResponse,
  ReloadlyTransaction,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyOrdersService {
  private getBaseUrl() {
    return reloadlyConfig.getBaseUrl();
  }

  /**
   * Create a new gift card order
   * POST https://giftcards.reloadly.com/orders
   * 
   * According to Reloadly official documentation
   */
  async createOrder(orderData: ReloadlyOrderRequest): Promise<ReloadlyOrderResponse> {
    try {
      const token = await reloadlyAuthService.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/com.reloadly.giftcards-v1+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData: ReloadlyError = await response.json().catch(() => ({}));
        throw new Error(
          `Reloadly API error: ${errorData.error || errorData.message || response.statusText} (${response.status})`
        );
      }

      const data: ReloadlyOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get card codes by transaction ID
   * This is the endpoint to get the actual gift card code after order completion
   */
  async getCardCodes(transactionId: number): Promise<ReloadlyCardCodesResponse> {
    try {
      const token = await reloadlyAuthService.getAccessToken();

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
      const token = await reloadlyAuthService.getAccessToken();

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

