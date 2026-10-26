import { createHmac, timingSafeEqual } from 'crypto';
import { obiexConfig } from './obiex.config';

/**
 * Verify Obiex webhook: HMAC-SHA512 hex of raw body vs x-obiex-signature.
 * Fails closed when secret is missing or signature is absent/invalid.
 */
export function verifyObiexWebhookSignature(
  rawBody: string | Buffer,
  headerSignature: string | undefined
): boolean {
  const secret = obiexConfig.getWebhookSignatureSecret();
  if (!secret) {
    console.error('[Obiex webhook] OBIEX_SIGNATURE_SECRET not set — rejecting webhook');
    return false;
  }
  if (!headerSignature || !String(headerSignature).trim()) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const computed = createHmac('sha512', secret).update(body).digest('hex');
  const incoming = String(headerSignature).trim().replace(/^sha512=/i, '');

  try {
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(incoming, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
