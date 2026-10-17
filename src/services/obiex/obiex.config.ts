import dotenv from 'dotenv';

dotenv.config();

const STAGING_BASE = 'https://staging.api.obiex.finance/v1';
const PRODUCTION_BASE = 'https://api.obiex.finance/v1';

function maskSecret(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

/**
 * Obiex API credentials from environment.
 *
 * OBIEX_API_KEY            — API key
 * OBIEX_API_SECRET         — HMAC secret for API requests
 * OBIEX_SIGNATURE_SECRET   — webhook Signature Secret (or OBIEX_WEBHOOK_SECRET)
 * OBIEX_ENVIRONMENT        — sandbox | production (default sandbox)
 * OBIEX_BASE_URL           — optional override
 */
class ObiexConfigService {
  getEnvironment(): 'sandbox' | 'production' {
    const env = (process.env.OBIEX_ENVIRONMENT || 'sandbox').toLowerCase();
    return env === 'production' ? 'production' : 'sandbox';
  }

  getBaseUrl(): string {
    const override = process.env.OBIEX_BASE_URL?.trim();
    if (override) return override.replace(/\/$/, '');
    return this.getEnvironment() === 'production' ? PRODUCTION_BASE : STAGING_BASE;
  }

  getApiKey(): string {
    const key = process.env.OBIEX_API_KEY?.trim();
    if (!key) throw new Error('OBIEX_API_KEY is required in environment variables.');
    return key;
  }

  getApiSecret(): string {
    const secret = process.env.OBIEX_API_SECRET?.trim();
    if (!secret) throw new Error('OBIEX_API_SECRET is required in environment variables.');
    return secret;
  }

  getApiKeyOrNull(): string | null {
    return process.env.OBIEX_API_KEY?.trim() || null;
  }

  getApiSecretOrNull(): string | null {
    return process.env.OBIEX_API_SECRET?.trim() || null;
  }

  getWebhookSignatureSecret(): string | null {
    return (
      process.env.OBIEX_SIGNATURE_SECRET?.trim() ||
      process.env.OBIEX_WEBHOOK_SECRET?.trim() ||
      null
    );
  }

  isConfigured(): boolean {
    return !!(this.getApiKeyOrNull() && this.getApiSecretOrNull());
  }

  getConfigForAdmin() {
    return {
      configured: this.isConfigured(),
      environment: this.getEnvironment(),
      baseUrl: this.getBaseUrl(),
      apiKeyMasked: maskSecret(this.getApiKeyOrNull()),
      webhookSecretConfigured: !!this.getWebhookSignatureSecret(),
      envKeys: {
        apiKey: 'OBIEX_API_KEY',
        apiSecret: 'OBIEX_API_SECRET',
        signatureSecret: 'OBIEX_SIGNATURE_SECRET',
        environment: 'OBIEX_ENVIRONMENT',
        baseUrl: 'OBIEX_BASE_URL',
      },
    };
  }
}

export const obiexConfig = new ObiexConfigService();
