/**
 * Reloadly Countries Service
 * 
 * Handles all country-related API calls to Reloadly:
 * - Get all countries
 * - Get country by ISO code
 */

import { reloadlyConfig } from './reloadly.config';
import { reloadlyAuthService } from './reloadly.auth.service';
import {
  ReloadlyCountry,
  ReloadlyCountriesResponse,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyCountriesService {
  private getBaseUrl() {
    return reloadlyConfig.getBaseUrl();
  }

  /**
   * Get all countries
   */
  async getCountries(): Promise<ReloadlyCountriesResponse> {
    try {
      const token = await reloadlyAuthService.getAccessToken();

      const response = await fetch(`${this.getBaseUrl()}/countries`, {
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

      const data: ReloadlyCountriesResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching countries:', error);
      throw error;
    }
  }

  /**
   * Get country by ISO code
   */
  async getCountryByIso(isoCode: string): Promise<ReloadlyCountry> {
    try {
      const token = await reloadlyAuthService.getAccessToken();

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
}

// Export singleton instance
export const reloadlyCountriesService = new ReloadlyCountriesService();

