/**
 * Reloadly Utilities Authentication Service
 * Handles OAuth 2.0 token generation and management for Utilities API
 */

import axios from 'axios';
import { reloadlyUtilitiesConfig } from './reloadly.utilities.config';

interface ReloadlyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

class ReloadlyUtilitiesAuthService {
  private accessToken: string | null = null;
  private tokenExpiryTime: number = 0;

  /**
   * Get or generate access token
   * Tokens are cached until expiry
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiryTime) {
      return this.accessToken;
    }

    // Generate new token
    return await this.generateAccessToken();
  }

  /**
   * Generate a new access token from Reloadly Utilities API
   */
  private async generateAccessToken(): Promise<string> {
    reloadlyUtilitiesConfig.validateConfig();

    const authUrl = `${reloadlyUtilitiesConfig.getAuthUrl()}/oauth/token`;
    const payload = {
      client_id: reloadlyUtilitiesConfig.getClientId(),
      client_secret: reloadlyUtilitiesConfig.getClientSecret(),
      grant_type: 'client_credentials',
      audience: reloadlyUtilitiesConfig.getAudience(),
    };

    try {
      console.log('[RELOADLY UTILITIES AUTH] Requesting access token...');

      const response = await axios.post<ReloadlyTokenResponse>(authUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      this.accessToken = response.data.access_token;
      // Set expiry time (subtract 5 minutes for safety margin)
      const expiresInMs = (response.data.expires_in - 300) * 1000;
      this.tokenExpiryTime = Date.now() + expiresInMs;

      console.log('[RELOADLY UTILITIES AUTH] Access token generated successfully');
      return this.accessToken;
    } catch (error: any) {
      console.error('[RELOADLY UTILITIES AUTH] Failed to generate access token:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      throw new Error(
        error.response?.data?.message ||
        error.response?.data?.error_description ||
        error.message ||
        'Failed to generate Reloadly Utilities access token'
      );
    }
  }

  /**
   * Clear cached token (force refresh on next request)
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiryTime = 0;
  }
}

export const reloadlyUtilitiesAuth = new ReloadlyUtilitiesAuthService();

