import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BASE_URL = 'https://strowallet.com/api';

function maskSecret(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

/**
 * StroWallet credentials from environment (same pattern as PalmPay).
 *
 * STROWALLET_PUBLIC_KEY   — required for balance checks & bill payments
 * STROWALLET_SECRET_KEY   — optional (subaccount APIs)
 * STROWALLET_MERCHANT_ID  — optional
 * STROWALLET_WEBSITE_URL  — optional
 * STROWALLET_BASE_URL     — optional, default https://strowallet.com/api
 */
class StroWalletConfigService {
  getBaseUrl(): string {
    return (process.env.STROWALLET_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  getPublicKey(): string {
    const key = process.env.STROWALLET_PUBLIC_KEY?.trim();
    if (!key) {
      throw new Error(
        'STROWALLET_PUBLIC_KEY is required in environment variables. Add it to your .env file.'
      );
    }
    return key;
  }

  getPublicKeyOrNull(): string | null {
    return process.env.STROWALLET_PUBLIC_KEY?.trim() || null;
  }

  getSecretKey(): string | null {
    return process.env.STROWALLET_SECRET_KEY?.trim() || null;
  }

  getMerchantId(): string | null {
    return process.env.STROWALLET_MERCHANT_ID?.trim() || null;
  }

  getWebsiteUrl(): string | null {
    return process.env.STROWALLET_WEBSITE_URL?.trim() || null;
  }

  isConfigured(): boolean {
    return !!this.getPublicKeyOrNull();
  }

  /** Safe summary for admin API — never exposes raw secrets. */
  getConfigForAdmin() {
    const publicKey = this.getPublicKeyOrNull();
    const secretKey = this.getSecretKey();
    return {
      configured: this.isConfigured(),
      publicKeyMasked: maskSecret(publicKey),
      secretKeyMasked: maskSecret(secretKey),
      hasSecretKey: !!secretKey,
      merchantId: this.getMerchantId(),
      websiteUrl: this.getWebsiteUrl(),
      baseUrl: this.getBaseUrl(),
    };
  }
}

export const strowalletConfig = new StroWalletConfigService();
export { maskSecret as maskStroWalletSecret };
