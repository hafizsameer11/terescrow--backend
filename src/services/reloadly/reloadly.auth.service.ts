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
    } catch (error: any) {
      console.error('Error getting access token:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        response: error?.response,
        status: error?.status,
        cause: error?.cause,
        fullError: error,
      });
      throw new Error(`Failed to get Reloadly access token: ${error?.message || 'Unknown error'}`);
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
        let errorData: ReloadlyError | any = {};
        try {
          const text = await response.text();
          errorData = text ? JSON.parse(text) : {};
        } catch (parseError) {
          console.error('Failed to parse auth error response:', parseError);
        }
        
        const errorMessage = errorData.error || errorData.message || response.statusText || 'Unknown error';
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          errorData,
          authUrl: `${reloadlyConfig.authUrl}/oauth/token`,
        };
        
        console.error('Reloadly auth API error:', errorDetails);
        
        throw new Error(
          `Reloadly auth failed: ${errorMessage} (${response.status})`
        );
      }

      const data: ReloadlyAuthResponse = await response.json();

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);
      console.log('data', data);
      console.log('expiresAt', expiresAt);
      //log the token too
      console.log('data.access_token', data.access_token);
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
    } catch (error: any) {
      console.error('Error fetching new token from Reloadly:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        response: error?.response,
        status: error?.status,
        statusText: error?.statusText,
        errorData: error?.errorData,
        cause: error?.cause,
        fullError: error,
      });
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

