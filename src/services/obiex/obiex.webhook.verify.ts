import { createHmac, timingSafeEqual } from 'crypto';
import { obiexConfig } from './obiex.config';

/** Verify Obiex webhook: HMAC-SHA512 hex of raw body vs x-obiex-signature. */
export function verifyObiexWebhookSignature(
  rawBody: string | Buffer,
  headerSignature: string | undefined
): boolean {
  const secret = obiexConfig.getWebhookSignatureSecret();
  if (!secret) {
    console.warn('[Obiex webhook] OBIEX_SIGNATURE_SECRET not set — skipping signature verify');
    return true;
  }
  if (!headerSignature) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const computed = createHmac('sha512', secret).update(body).digest('hex');

  try {
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(String(headerSignature).trim(), 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
