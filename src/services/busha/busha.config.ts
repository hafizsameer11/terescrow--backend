import dotenv from 'dotenv';

dotenv.config();

const SANDBOX_BASE = 'https://api.sandbox.busha.so';
const PRODUCTION_BASE = 'https://api.busha.so';

function maskSecret(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

/**
 * Busha API credentials from environment.
 *
 * BUSHA_API_KEY       — Secret API key (required)
 * BUSHA_ENVIRONMENT   — sandbox | production (default sandbox)
 * BUSHA_BASE_URL      — optional override
 */
class BushaConfigService {
  getEnvironment(): 'sandbox' | 'production' {
    const env = (process.env.BUSHA_ENVIRONMENT || 'sandbox').toLowerCase();
    return env === 'production' ? 'production' : 'sandbox';
  }

  getBaseUrl(): string {
    const override = process.env.BUSHA_BASE_URL?.trim();
    if (override) return override.replace(/\/$/, '');
    return this.getEnvironment() === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
  }

  getApiKey(): string {
    const key = process.env.BUSHA_API_KEY?.trim();
    if (!key) {
      throw new Error('BUSHA_API_KEY is required in environment variables.');
    }
    return key;
  }

  getApiKeyOrNull(): string | null {
    return process.env.BUSHA_API_KEY?.trim() || null;
  }

  isConfigured(): boolean {
    return !!this.getApiKeyOrNull();
  }

  getConfigForAdmin() {
    const apiKey = this.getApiKeyOrNull();
    return {
      configured: this.isConfigured(),
      environment: this.getEnvironment(),
      baseUrl: this.getBaseUrl(),
      apiKeyMasked: maskSecret(apiKey),
      envKeys: {
        apiKey: 'BUSHA_API_KEY',
        environment: 'BUSHA_ENVIRONMENT',
        baseUrl: 'BUSHA_BASE_URL',
      },
    };
  }
}

export const bushaConfig = new BushaConfigService();
