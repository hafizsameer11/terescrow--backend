import dotenv from 'dotenv';

dotenv.config();

/**
 * Prembly (IdentityPass) credentials.
 *
 * PREMBLY_ENABLED          true|false — default false (hidden for testing)
 * PREMBLY_API_KEY          (x-api-key) — required when enabled
 * PREMBLY_APP_ID           optional; legacy IdentityPass header (many endpoints need only x-api-key)
 * PREMBLY_BASE_URL         optional (default https://api.prembly.com)
 * PREMBLY_FACE_MATCH_MIN   min face confidence 0-100 (default 80)
 * PREMBLY_AUTO_APPROVE     true|false (default true when Prembly configured)
 */
class PremblyConfigService {
  /**
   * Master switch. When false, Tier 2 skips Prembly and auto-approves
   * so buy/sell/Busha can be tested without identity API.
   * Set PREMBLY_ENABLED=true when ready to go live with Prembly.
   */
  isEnabled(): boolean {
    const v = (process.env.PREMBLY_ENABLED || 'false').toLowerCase();
    return v === 'true' || v === '1';
  }

  getAppId(): string | null {
    return process.env.PREMBLY_APP_ID?.trim() || null;
  }

  getApiKey(): string | null {
    return process.env.PREMBLY_API_KEY?.trim() || process.env.PREMBLY_X_API_KEY?.trim() || null;
  }

  getBaseUrl(): string {
    const override = process.env.PREMBLY_BASE_URL?.trim();
    if (override) return override.replace(/\/$/, '');
    return 'https://api.prembly.com';
  }

  isConfigured(): boolean {
    return this.isEnabled() && !!this.getApiKey();
  }

  /** Minimum face match confidence (0–100). Prembly may return 0–1 or 0–100. */
  getMinFaceConfidence(): number {
    const raw = Number(process.env.PREMBLY_FACE_MATCH_MIN || 80);
    return Number.isFinite(raw) && raw > 0 ? raw : 80;
  }

  autoApproveOnPass(): boolean {
    const v = (process.env.PREMBLY_AUTO_APPROVE || 'true').toLowerCase();
    return v !== 'false' && v !== '0';
  }
}

export const premblyConfig = new PremblyConfigService();
