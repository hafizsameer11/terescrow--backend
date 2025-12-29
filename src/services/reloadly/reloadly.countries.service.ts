/**
 * Reloadly Countries Service
 * 
 * Handles all country-related API calls to Reloadly:
 * - Get all countries
 * - Get country by ISO code
 * - Get all categories
 */

import { reloadlyConfig } from './reloadly.config';
import { reloadlyAuth } from './reloadly.auth.service';
import {
  ReloadlyCountry,
  ReloadlyCountriesResponse,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyCountriesService {
  private getBaseUrl() {
    // Gift cards use a different base URL than topups/airtime
    //  const environment = reloadlyConfig.getEnvironment();
    // return environment === 'production'
    return 'https://giftcards.reloadly.com'
      // : 'https://giftcards-sandbox.reloadly.com';
  }
  

  /**
   * Get all countries
   */
  async getCountries(): Promise<ReloadlyCountriesResponse> {
    try {
      const token = await reloadlyAuth.getAccessToken();
      console.log('token', token);
      const response = await fetch(`${this.getBaseUrl()}/countries`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/com.reloadly.giftcards-v1+json',
        },
      });

      if (!response.ok) {
        let errorData: ReloadlyError | any = {};
        try {
          const text = await response.text();
          errorData = text ? JSON.parse(text) : {};
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }
        
        const errorMessage = errorData.error || errorData.message || response.statusText || 'Unknown error';
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          errorData,
          url: `${this.getBaseUrl()}/countries`,
        };
        
        console.error('Reloadly API error in getCountries:', errorDetails);
        
        throw new Error(
          `Reloadly API error: ${errorMessage} (${response.status})`
        );
      }

      const data = await response.json();
      console.log('Raw data from Reloadly (first 2 items):', Array.isArray(data) ? data.slice(0, 2) : data);
      console.log('Is array:', Array.isArray(data));
      console.log('Array length:', Array.isArray(data) ? data.length : 'N/A');
      
      // Reloadly API returns countries as a direct array (not wrapped in content)
      // Always wrap it in the expected ReloadlyCountriesResponse structure
      if (Array.isArray(data)) {
        const wrappedResponse = {
          content: data,
          totalElements: data.length,
        } as ReloadlyCountriesResponse;
        console.log('Wrapped response structure:', {
          hasContent: !!wrappedResponse.content,
          contentLength: wrappedResponse.content?.length,
          totalElements: wrappedResponse.totalElements,
        });
        return wrappedResponse;
      }
      
      // Fallback: if somehow it's not an array, try to extract content or return empty
      console.warn('Unexpected response format from Reloadly countries API:', data);
      return {
        content: data?.content || [],
        totalElements: data?.totalElements || 0,
      } as ReloadlyCountriesResponse;
    } catch (error: any) {
      console.error('Error fetching countries from Reloadly:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        response: error?.response,
        status: error?.status,
        cause: error?.cause,
        fullError: error,
      });
      throw error;
    }
  }

  /**
   * Get country by ISO code
   */
  async getCountryByIso(isoCode: string): Promise<ReloadlyCountry> {
    try {
      const token = await reloadlyAuth.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/countries/${isoCode}`, {
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

      const data: ReloadlyCountry = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching country ${isoCode}:`, error);
      throw error;
    }
  }

  /**
   * Get all categories
   * Reloadly API returns categories as a direct array
   */
  async getCategories(): Promise<Array<{ id: number; name: string }>> {
    try {
      const token = await reloadlyAuth.getAccessToken();
      const response = await fetch(`${this.getBaseUrl()}/product-categories`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/com.reloadly.giftcards-v1+json',
        },
      });

      if (!response.ok) {
        let errorData: ReloadlyError | any = {};
        try {
          const text = await response.text();
          errorData = text ? JSON.parse(text) : {};
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }
        
        const errorMessage = errorData.error || errorData.message || response.statusText || 'Unknown error';
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          errorData,
          url: `${this.getBaseUrl()}/product-categories`,
        };
        
        console.error('Reloadly API error in getCategories:', errorDetails);
        
        throw new Error(
          `Reloadly API error: ${errorMessage} (${response.status})`
        );
      }

      const data = await response.json();
      console.log('Raw categories data from Reloadly (first 3 items):', Array.isArray(data) ? data.slice(0, 3) : data);
      console.log('Is array:', Array.isArray(data));
      console.log('Array length:', Array.isArray(data) ? data.length : 'N/A');
      
      // Reloadly API returns categories as a direct array
      if (Array.isArray(data)) {
        return data;
      }
      
      // Fallback: if somehow it's not an array, return empty
      console.warn('Unexpected response format from Reloadly categories API:', data);
      return [];
    } catch (error: any) {
      console.error('Error fetching categories from Reloadly:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        response: error?.response,
        status: error?.status,
        cause: error?.cause,
        fullError: error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const reloadlyCountriesService = new ReloadlyCountriesService();

