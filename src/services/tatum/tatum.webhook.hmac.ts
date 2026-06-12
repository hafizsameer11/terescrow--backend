import crypto from 'crypto';

/**
 * Verify Tatum webhook `x-payload-hash` (HMAC-SHA512 hex of raw JSON body).
 * Set TATUM_WEBHOOK_HMAC_SECRET from Tatum dashboard subscription settings.
 */
export function verifyTatumWebhookHmac(rawBody: string, headerHash: string | undefined): boolean {
  const secret = process.env.TATUM_WEBHOOK_HMAC_SECRET?.trim();
  if (!secret) return true;
  if (!headerHash?.trim()) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const received = headerHash.trim().toLowerCase();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}

export function isTatumWebhookHmacConfigured(): boolean {
  return Boolean(process.env.TATUM_WEBHOOK_HMAC_SECRET?.trim());
}
