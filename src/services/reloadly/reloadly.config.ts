/**
 * Reloadly Configuration Service
 * Manages Reloadly API configuration and base URLs
 */

export interface ReloadlyConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  authUrl: string;
  audience: string; // Product audience URL
}

class ReloadlyConfigService {
  private config: ReloadlyConfig;

  constructor() {
    const environment = (process.env.RELOADLY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    const clientId = process.env.RELOADLY_CLIENT_ID || '';
    const clientSecret = process.env.RELOADLY_CLIENT_SECRET || '';
    
    this.config = {
      clientId,
      clientSecret,
      environment,
      baseUrl: environment === 'production'
        ? process.env.RELOADLY_BASE_URL || 'https://topups.reloadly.com'
        : process.env.RELOADLY_SANDBOX_URL || 'https://topups-sandbox.reloadly.com',
      authUrl: process.env.RELOADLY_AUTH_URL || 'https://auth.reloadly.com',
      audience: process.env.RELOADLY_AUDIENCE || (environment === 'production' 
        ? 'https://topups.reloadly.com'
        : 'https://topups-sandbox.reloadly.com'),
    };
  }

  getConfig(): ReloadlyConfig {
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

  /**
   * Get gift cards audience URL
   * Gift cards use a different audience than topups/airtime
   */
  getGiftCardsAudience(): string {
    const environment = this.config.environment;
    return environment === 'production'
      ? 'https://giftcards.reloadly.com'
      : 'https://giftcards-sandbox.reloadly.com';
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

export const reloadlyConfig = new ReloadlyConfigService();
