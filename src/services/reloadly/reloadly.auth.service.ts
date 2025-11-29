/**
 * Reloadly Authentication Service
 * 
 * Handles OAuth token management for Reloadly API.
 * - Fetches access tokens
 * - Manages token expiration
 * - Stores tokens in database
 * - Auto-refreshes expired tokens
 */

import { prisma } from '../../utils/prisma';
import { reloadlyConfig } from './reloadly.config';
import {
  ReloadlyAuthRequest,
  ReloadlyAuthResponse,
  ReloadlyError,
} from '../../types/reloadly.types';

class ReloadlyAuthService {
  private getConfig() {
    return reloadlyConfig.getConfig();
  }

  /**
   * Get valid access token (from DB or fetch new one)
   */
  async getAccessToken(): Promise<string> {
    try {
      const reloadlyConfig = this.getConfig();
      
      // Check if we have a valid token in database
      const config = await prisma.reloadlyConfig.findUnique({
        where: { environment: reloadlyConfig.environment },
      });

      if (config?.accessToken && config.tokenExpiresAt) {
        const now = new Date();
        const expiresAt = new Date(config.tokenExpiresAt);
        
        // If token expires in more than 5 minutes, use it
        if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
          return config.accessToken;
        }
      }

      // Token expired or doesn't exist, fetch new one
      return await this.fetchNewToken();
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to get Reloadly access token');
    }
  }

  /**
   * Fetch new access token from Reloadly
   */
  async fetchNewToken(): Promise<string> {
    try {
      const reloadlyConfig = this.getConfig();
      
      const authRequest: ReloadlyAuthRequest = {
        client_id: reloadlyConfig.clientId,
        client_secret: reloadlyConfig.clientSecret,
        grant_type: 'client_credentials',
        audience: reloadlyConfig.audience,
      };

      const response = await fetch(`${reloadlyConfig.authUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authRequest),
      });

      if (!response.ok) {
        const errorData: ReloadlyError = await response.json();
        throw new Error(
          `Reloadly auth failed: ${errorData.error || errorData.message || response.statusText}`
        );
      }

      const data: ReloadlyAuthResponse = await response.json();

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);
      
      // Store token in database
      await prisma.reloadlyConfig.upsert({
        where: { environment: reloadlyConfig.environment },
        update: {
          accessToken: data.access_token,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
        create: {
          environment: reloadlyConfig.environment,
          clientId: reloadlyConfig.clientId,
          clientSecret: reloadlyConfig.clientSecret,
          accessToken: data.access_token,
          tokenExpiresAt: expiresAt,
          isActive: true,
        },
      });

      return data.access_token;
    } catch (error) {
      console.error('Error fetching new token:', error);
      throw error;
    }
  }

  /**
   * Force refresh token (for admin use)
   */
  async refreshToken(): Promise<string> {
    return await this.fetchNewToken();
  }

  /**
   * Get token info from database
   */
  async getTokenInfo(): Promise<{
    hasToken: boolean;
    expiresAt: Date | null;
    isExpired: boolean;
  }> {
    const reloadlyConfig = this.getConfig();
    const config = await prisma.reloadlyConfig.findUnique({
      where: { environment: reloadlyConfig.environment },
      select: {
        tokenExpiresAt: true,
      },
    });

    if (!config?.tokenExpiresAt) {
      return {
        hasToken: false,
        expiresAt: null,
        isExpired: true,
      };
    }

    const now = new Date();
    const expiresAt = new Date(config.tokenExpiresAt);

    return {
      hasToken: true,
      expiresAt,
      isExpired: expiresAt <= now,
    };
  }
}

// Export singleton instance
export const reloadlyAuthService = new ReloadlyAuthService();

