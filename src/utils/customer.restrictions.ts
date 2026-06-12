import { prisma } from './prisma';

/** Canonical keys stored in `user_feature_freezes.feature` (lowercase). */
export const FEATURE_DEPOSIT = 'deposit';
export const FEATURE_WITHDRAWAL = 'withdrawal';
export const FEATURE_CRYPTO = 'send/receive/swap/buy/sell crypto';
export const FEATURE_GIFT_CARD = 'buy/sell gift card';

export interface CustomerRestrictions {
  banned: boolean;
  frozenFeatures: string[];
}

export function normalizeFeatureKey(feature: string): string {
  return feature.toLowerCase().trim();
}

export function isUserBanned(status: string | null | undefined): boolean {
  return (status ?? '').toLowerCase() === 'banned';
}

export async function getCustomerRestrictions(userId: number): Promise<CustomerRestrictions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  const banned = isUserBanned(user?.status);

  let frozenFeatures: string[] = [];
  try {
    const freezes: Array<{ feature: string }> = await (prisma as any).userFeatureFreeze.findMany({
      where: { userId },
      select: { feature: true },
    });
    frozenFeatures = freezes.map((f: { feature: string }) => normalizeFeatureKey(f.feature));
  } catch (_) {
    // Table may not exist yet before migration runs
  }

  return { banned, frozenFeatures };
}

export function isFeatureFrozen(restrictions: CustomerRestrictions, feature: string): boolean {
  const key = normalizeFeatureKey(feature);
  return restrictions.frozenFeatures.includes(key);
}

export function forbiddenMessageForRestrictions(
  restrictions: CustomerRestrictions,
  feature: string,
  featureLabel: string
): string | null {
  if (restrictions.banned) {
    return 'Your account has been banned. Contact support.';
  }
  if (isFeatureFrozen(restrictions, feature)) {
    return `${featureLabel} is temporarily disabled for your account.`;
  }
  return null;
}
