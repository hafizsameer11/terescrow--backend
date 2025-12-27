/**
 * VTpass Configuration Service
 * 
 * Manages VTpass API configuration and environment settings.
 * Handles both sandbox and production environments.
 */

import dotenv from 'dotenv';

dotenv.config();

export interface VtpassConfig {
  apiKey: string;
  publicKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
}

class VtpassConfigService {
  private config: VtpassConfig;

  constructor() {
    const environment = (process.env.VTPASS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    const apiKey = process.env.VTPASS_API_KEY || '';
    const publicKey = process.env.VTPASS_PUBLIC_KEY || '';
    const secretKey = process.env.VTPASS_SECRET_KEY || '';
    
    this.config = {
      apiKey,
      publicKey,
      secretKey,
      environment,
      baseUrl: environment === 'production' 
        ? process.env.VTPASS_BASE_URL || 'https://vtpass.com/api'
        : process.env.VTPASS_SANDBOX_URL || 'https://sandbox.vtpass.com/api',
    };
  }

  /**
   * Validate config only when actually needed (lazy validation)
   */
  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('VTPASS_API_KEY is required in environment variables. Please add it to your .env file.');
    }
    if (!this.config.publicKey) {
      throw new Error('VTPASS_PUBLIC_KEY is required in environment variables. Please add it to your .env file.');
    }
    if (!this.config.secretKey) {
      throw new Error('VTPASS_SECRET_KEY is required in environment variables. Please add it to your .env file.');
    }
  }

  getConfig(): VtpassConfig {
    this.validateConfig(); // Validate only when accessed
    return { ...this.config };
  }

  getBaseUrl(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.baseUrl;
  }

  getApiKey(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.apiKey;
  }

  getPublicKey(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.publicKey;
  }

  getSecretKey(): string {
    this.validateConfig(); // Validate only when accessed
    return this.config.secretKey;
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
export const vtpassConfig = new VtpassConfigService();

