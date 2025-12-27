/**
 * Reloadly Products Service
 * 
 * Handles all product-related API calls to Reloadly:
 * - Get all products
 * - Get product by ID
 * - Get products by country
 * - Product filtering and search
 */

import { reloadlyConfig } from './reloadly.config';
import { reloadlyAuth } from './reloadly.auth.service';
import {
  ReloadlyProduct,
  ReloadlyProductsResponse,
  ReloadlyProductQueryParams,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyProductsService {
  private getBaseUrl() {
    return reloadlyConfig.getBaseUrl();
  }

  /**
   * Get all products with optional filters
   */
  async getProducts(params?: ReloadlyProductQueryParams): Promise<ReloadlyProductsResponse> {
    try {
      const token = await reloadlyAuth.getAccessToken();
      console.log('token reloadly products', token);
      const queryParams = new URLSearchParams();
      if (params?.countryCode) queryParams.append('countryCode', params.countryCode);
      if (params?.productName) queryParams.append('productName', params.productName);
      if (params?.includeRange !== undefined) queryParams.append('includeRange', String(params.includeRange));
      if (params?.includeFixed !== undefined) queryParams.append('includeFixed', String(params.includeFixed));
      if (params?.page) queryParams.append('page', String(params.page));
      if (params?.size) queryParams.append('size', String(params.size));

      const url = `${this.getBaseUrl()}/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
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
      // console.log('response reloadly products ', response.json());
      const data: ReloadlyProductsResponse = await response.json();
      // console.log('data reloadly products', data);
      return data;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  async getProductById(productId: number): Promise<ReloadlyProduct> {
    try {
      const token = await reloadlyAuth.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/products/${productId}`, {
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

      const data: ReloadlyProduct = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Get products by country ISO code
   */
  async getProductsByCountry(countryCode: string, params?: { page?: number; size?: number }): Promise<ReloadlyProductsResponse> {
    try {
      const token = await reloadlyAuth.getAccessToken();
      
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', String(params.page));
      if (params?.size) queryParams.append('size', String(params.size));

      const url = `${this.getBaseUrl()}/countries/${countryCode}/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
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

      const data: ReloadlyProductsResponse = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching products for country ${countryCode}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const reloadlyProductsService = new ReloadlyProductsService();

