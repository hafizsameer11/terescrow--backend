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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  const banned = (user?.status === 'banned') || false;

  let frozenFeatures: string[] = [];
  try {
    const freezes: Array<{ feature: string }> = await (prisma as any).userFeatureFreeze.findMany({
      where: { userId },
      select: { feature: true },
    });
    frozenFeatures = freezes.map((f: { feature: string }) => f.feature);
  } catch (_) {
    // Table may not exist yet before migration runs
  }

  return { banned, frozenFeatures };
}

export function isFeatureFrozen(restrictions: CustomerRestrictions, feature: string): boolean {
  return restrictions.frozenFeatures.includes(feature);
}
