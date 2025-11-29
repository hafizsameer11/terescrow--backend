/**
 * Reloadly Configuration Service
 * 
 * Manages Reloadly API configuration and environment settings.
 * Handles both sandbox and production environments.
 */

import dotenv from 'dotenv';

dotenv.config();

export interface ReloadlyConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  authUrl: string;
  audience: string;
}

class ReloadlyConfigService {
  private config: ReloadlyConfig;

  constructor() {
    const environment = (process.env.RELOADLY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    this.config = {
      clientId: process.env.RELOADLY_CLIENT_ID || '',
      clientSecret: process.env.RELOADLY_CLIENT_SECRET || '',
      environment,
      baseUrl: environment === 'production' 
        ? process.env.RELOADLY_BASE_URL || 'https://giftcards.reloadly.com'
        : process.env.RELOADLY_SANDBOX_URL || 'https://giftcards-sandbox.reloadly.com',
      authUrl: process.env.RELOADLY_AUTH_URL || 'https://auth.reloadly.com',
      audience: environment === 'production'
        ? 'https://giftcards.reloadly.com'
        : 'https://giftcards-sandbox.reloadly.com',
    };
  }

  /**
   * Validate config only when actually needed (lazy validation)
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('RELOADLY_CLIENT_ID is required in environment variables. Please add it to your .env file.');
    }
    if (!this.config.clientSecret) {
      throw new Error('RELOADLY_CLIENT_SECRET is required in environment variables. Please add it to your .env file.');
    }
  }

  getConfig(): ReloadlyConfig {
    this.validateConfig(); // Validate only when accessed
    return { ...this.config };
  }

  getBaseUrl(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.baseUrl;
  }

  getAuthUrl(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.authUrl;
  }

  getAudience(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.audience;
  }

  getClientId(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.clientId;
  }

  getClientSecret(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.clientSecret;
  }

  getEnvironment(): 'sandbox' | 'production' {
    return this.config.environment;
  }

  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  isSandbox(): boolean {
    return this.config.environment === 'sandbox';
  }
}

// Export singleton instance
export const reloadlyConfig = new ReloadlyConfigService();

