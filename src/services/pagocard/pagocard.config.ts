import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BASE_URL = 'https://pagocards.com';

class PagocardConfigService {
  getBaseUrl(): string {
    return (process.env.PAGOCARD_BASE_URL || process.env.PAGOCARDS_API_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  getPublicKey(): string {
    const key = (process.env.PAGOCARD_PUBLIC_KEY || process.env.PAGOCARDS_PUBLIC_KEY)?.trim();
    if (!key) {
      throw new Error(
        'PAGOCARD_PUBLIC_KEY is required in environment variables. Add it to your .env file.'
      );
    }
    return key;
  }

  getPublicKeyOrNull(): string | null {
    return (process.env.PAGOCARD_PUBLIC_KEY || process.env.PAGOCARDS_PUBLIC_KEY)?.trim() || null;
  }

  getSecretKey(): string {
    const key = (process.env.PAGOCARD_SECRET_KEY || process.env.PAGOCARDS_SECRET_KEY)?.trim();
    if (!key) {
      throw new Error(
        'PAGOCARD_SECRET_KEY is required in environment variables. Add it to your .env file.'
      );
    }
    return key;
  }

  getSecretKeyOrNull(): string | null {
    return (process.env.PAGOCARD_SECRET_KEY || process.env.PAGOCARDS_SECRET_KEY)?.trim() || null;
  }

  isConfigured(): boolean {
    return !!(this.getPublicKeyOrNull() && this.getSecretKeyOrNull());
  }

  getAuthHeaders() {
    return {
      publickey: this.getPublicKey(),
      secretkey: this.getSecretKey(),
    };
  }
}

export const pagocardConfig = new PagocardConfigService();
