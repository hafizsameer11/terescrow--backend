import { prisma } from './prisma';

export const FEATURE_DEPOSIT = 'Deposit';
export const FEATURE_WITHDRAWAL = 'Withdrawal';
export const FEATURE_CRYPTO = 'Send/Receive/Swap/Buy/Sell Crypto';
export const FEATURE_GIFT_CARD = 'Buy/Sell Gift Card';

export interface CustomerRestrictions {
  banned: boolean;
  frozenFeatures: string[];
}

export async function getCustomerRestrictions(userId: number): Promise<CustomerRestrictions> {
  const [user, freezes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    }),
    prisma.userFeatureFreeze.findMany({
      where: { userId },
      select: { feature: true },
    }),
  ]);
  const banned = (user?.status === 'banned') || false;
  const frozenFeatures = freezes.map((f) => f.feature);
  return { banned, frozenFeatures };
}

export function isFeatureFrozen(restrictions: CustomerRestrictions, feature: string): boolean {
  return restrictions.frozenFeatures.includes(feature);
}
