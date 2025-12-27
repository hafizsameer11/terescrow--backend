/**
 * Reloadly Utilities Configuration Service
 * Manages Reloadly Utilities API configuration and base URLs
 */

export interface ReloadlyUtilitiesConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  authUrl: string;
  audience: string; // Utilities audience URL
}

class ReloadlyUtilitiesConfigService {
  private config: ReloadlyUtilitiesConfig;

  constructor() {
    const environment = (process.env.RELOADLY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    const clientId = process.env.RELOADLY_CLIENT_ID || '';
    const clientSecret = process.env.RELOADLY_CLIENT_SECRET || '';
    
    this.config = {
      clientId,
      clientSecret,
      environment,
      baseUrl: environment === 'production'
        ? process.env.RELOADLY_UTILITIES_BASE_URL || 'https://utilities.reloadly.com'
        : process.env.RELOADLY_UTILITIES_SANDBOX_URL || 'https://utilities-sandbox.reloadly.com',
      authUrl: process.env.RELOADLY_AUTH_URL || 'https://auth.reloadly.com',
      audience: process.env.RELOADLY_UTILITIES_AUDIENCE || (environment === 'production' 
        ? 'https://utilities.reloadly.com'
        : 'https://utilities-sandbox.reloadly.com'),
    };
  }

  getConfig(): ReloadlyUtilitiesConfig {
    return this.config;
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getAuthUrl(): string {
    return this.config.authUrl;
  }

  getClientId(): string {
    return this.config.clientId;
  }

  getClientSecret(): string {
    return this.config.clientSecret;
  }

  getAudience(): string {
    return this.config.audience;
  }

  getEnvironment(): 'sandbox' | 'production' {
    return this.config.environment;
  }

  validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('RELOADLY_CLIENT_ID is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('RELOADLY_CLIENT_SECRET is required');
    }
  }
}

export const reloadlyUtilitiesConfig = new ReloadlyUtilitiesConfigService();

