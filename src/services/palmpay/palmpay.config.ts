import dotenv from 'dotenv';

dotenv.config();

/**
 * PalmPay Configuration Service
 * Manages PalmPay API configuration with lazy validation
 */
class PalmPayConfigService {
  private baseUrl: string | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private merchantId: string | null = null;
  private appId: string | null = null;
  private publicKey: string | null = null;
  private privateKey: string | null = null;
  private countryCode: string | null = null;
  private version: string | null = null;
  private environment: string | null = null;

  /**
   * Get base URL (sandbox or production)
   */
  getBaseUrl(): string {
    if (this.baseUrl) return this.baseUrl;

    const env = this.getEnvironment();
    this.baseUrl =
      // env === 'production'?
       'https://open-gw-prod.palmpay-inc.com';
      //   : 
        // 'https://open-gw-daily.palmpay-inc.com';

    return this.baseUrl;
  }

  /**
   * Get API key
   * Used in Authorization: Bearer header for all API requests
   * 
   * Note: This is separate from the signature system.
   * For testing, you can use the merchant ID or app ID if API key is not provided.
   */
  getApiKey(): string {
    if (this.apiKey) return this.apiKey;

    this.apiKey = process.env.PALMPAY_APP_ID || '';
    console.log('apiKey palmpay config service', this.apiKey);
    // For testing: fallback to app ID first, then merchant ID if API key not set
    if (!this.apiKey) {
      const appId = this.getAppId();
      // const merchantId = this.getMerchantId();
      
      // Prioritize App ID over Merchant ID
      if (appId) {
        this.apiKey = appId;
        console.warn('PALMPAY_API_KEY not set, using PALMPAY_APP_ID as fallback for testing');
        return this.apiKey;
      }
      
      // if (merchantId) {
      //   this.apiKey = merchantId;
      //   console.warn('PALMPAY_API_KEY not set, using PALMPAY_MERCHANT_ID as fallback for testing');
      //   return this.apiKey;
      // }
      
      throw new Error(
        'PALMPAY_API_KEY is required in environment variables. Please add it to your .env file.\n' +
        'Alternatively, set PALMPAY_APP_ID or PALMPAY_MERCHANT_ID for testing.'
      );
    }

    return this.apiKey;
  }

  /**
   * Get API secret
   * 
   * Note: This is currently not used in the signature generation or API requests.
   * Signature uses PALMPAY_PRIVATE_KEY instead.
   * Making this optional for now.
   */
  getApiSecret(): string | null {
    if (this.apiSecret !== null) return this.apiSecret;

    this.apiSecret = process.env.PALMPAY_API_SECRET || null;
    // Not required - signature uses private key, not API secret
    return this.apiSecret;
  }

  /**
   * Get merchant ID
   */
  getMerchantId(): string | null {
    if (this.merchantId !== null) return this.merchantId;

    this.merchantId = process.env.PALMPAY_MERCHANT_ID || null;
    return this.merchantId;
  }

  /**
   * Get app ID
   */
  getAppId(): string | null {
    if (this.appId !== null) return this.appId;

    this.appId = process.env.PALMPAY_APP_ID || null;
    return this.appId;
  }

  /**
   * Get public key for signature verification
   */
  getPublicKey(): string | null {
    if (this.publicKey !== null) return this.publicKey;

    this.publicKey = process.env.PALMPAY_PUBLIC_KEY || null;
    return this.publicKey;
  }

  /**
   * Get private key for signature generation
   */
  getPrivateKey(): string {
    if (this.privateKey) return this.privateKey;

    this.privateKey = process.env.PALMPAY_PRIVATE_KEY || '';
    if (!this.privateKey) {
      throw new Error(
        'PALMPAY_PRIVATE_KEY is required in environment variables. Please add it to your .env file.'
      );
    }

    // Handle escaped newlines (common in .env files)
    this.privateKey = this.privateKey.replace(/\\n/g, '\n');
    
    // Remove any extra whitespace but preserve structure if it's PEM format
    if (this.privateKey.includes('-----BEGIN')) {
      // It's already in PEM format, just trim edges
      this.privateKey = this.privateKey.trim();
    } else {
      // It's Base64 encoded, remove all whitespace and newlines
      this.privateKey = this.privateKey.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '').trim();
    }

    return this.privateKey;
  }

  /**
   * Get country code
   */
  getCountryCode(): string {
    if (this.countryCode) return this.countryCode;

    this.countryCode = process.env.PALMPAY_COUNTRY_CODE || 'NG';
    return this.countryCode;
  }

  /**
   * Get API version
   */
  getVersion(): string {
    if (this.version) return this.version;

    this.version = process.env.PALMPAY_VERSION || 'V2';
    return this.version;
  }

  /**
   * Get environment (sandbox or production)
   */
  getEnvironment(): string {
    if (this.environment) return this.environment;

    this.environment = process.env.PALMPAY_ENVIRONMENT || 'sandbox';
    return this.environment;
  }

  /**
   * Get webhook URL
   */
  getWebhookUrl(): string {
    return process.env.PALMPAY_WEBHOOK_URL || 'https://backend.tercescrow.site/api/v2/webhooks/palmpay';
  }

  /**
   * Get all configuration
   */
  getConfig() {
    return {
      baseUrl: this.getBaseUrl(),
      apiKey: this.getApiKey(),
      apiSecret: this.getApiSecret(),
      merchantId: this.getMerchantId(),
      appId: this.getAppId(),
      publicKey: this.getPublicKey(),
      privateKey: '***', // Never expose private key in config
      countryCode: this.getCountryCode(),
      version: this.getVersion(),
      environment: this.getEnvironment(),
      webhookUrl: this.getWebhookUrl(),
    };
  }
}

// Export singleton instance
export const palmpayConfig = new PalmPayConfigService();

