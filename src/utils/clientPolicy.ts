import { Request } from 'express';
import ApiError from './ApiError';
import { prisma } from './prisma';

/**
 * New mobile app (tercescrow-v2) sends:
 *   X-Terescrow-Client: v2
 *   X-Terescrow-App-Version: <semver>
 *
 * Old app / unknown clients send neither → treated as legacy (strict KYC).
 */
export function isV2AppClient(req: Request): boolean {
  const raw = String(req.headers['x-terescrow-client'] || '').trim().toLowerCase();
  return raw === 'v2' || raw === 'tercescrow-v2' || raw === 'new';
}

/**
 * Legacy (old) app: crypto requires Tier 2 verified.
 * New v2 app: no Tier 2 gate for crypto (Obiex / in-app use).
 */
export async function assertLegacyCryptoTier2(
  req: Request,
  userId: number
): Promise<void> {
  if (isV2AppClient(req)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycTier2Verified: true },
  });
  if (!user?.kycTier2Verified) {
    throw ApiError.forbidden(
      'Complete Tier 2 KYC (NIN + selfie) before using crypto.'
    );
  }
}
