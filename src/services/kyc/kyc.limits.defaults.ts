import { KycTier } from '@prisma/client';
import { prisma } from '../../utils/prisma';

/** Terescrow product limits — daily deposit / withdrawal per tier (NGN). */
export const KYC_TIER_LIMITS: Record<
  KycTier,
  { depositDaily: string; withdrawalDaily: string }
> = {
  tier1: { depositDaily: '100000', withdrawalDaily: '1000000' },
  tier2: { depositDaily: '1000000', withdrawalDaily: '5000000' },
  tier3: { depositDaily: '5000000', withdrawalDaily: '50000000' },
  tier4: { depositDaily: '5000000', withdrawalDaily: '50000000' },
};

function monthlyFromDaily(daily: string): string {
  const n = Number(daily);
  if (!Number.isFinite(n)) return '0';
  return String(n * 30);
}

/** Upsert default KYC limits (idempotent). */
export async function ensureKycLimitsDefaults(): Promise<void> {
  const tiers = ['tier1', 'tier2', 'tier3'] as KycTier[];
  for (const tier of tiers) {
    const { depositDaily, withdrawalDaily } = KYC_TIER_LIMITS[tier];
    await prisma.kycLimits.upsert({
      where: { tier },
      create: {
        tier,
        depositDailyLimit: depositDaily,
        depositMonthlyLimit: monthlyFromDaily(depositDaily),
        withdrawalDailyLimit: withdrawalDaily,
        withdrawalMonthlyLimit: monthlyFromDaily(withdrawalDaily),
      },
      update: {
        depositDailyLimit: depositDaily,
        depositMonthlyLimit: monthlyFromDaily(depositDaily),
        withdrawalDailyLimit: withdrawalDaily,
        withdrawalMonthlyLimit: monthlyFromDaily(withdrawalDaily),
      },
    });
  }
}

/** Resolve effective daily limits for a user from their current KYC tier. */
export async function getUserFiatLimits(userId: number): Promise<{
  tier: KycTier;
  depositDaily: number;
  depositMonthly: number;
  withdrawalDaily: number;
  withdrawalMonthly: number;
}> {
  await ensureKycLimitsDefaults();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentKycTier: true,
      kycTier3Verified: true,
      kycTier2Verified: true,
      kycTier1Verified: true,
    },
  });

  let tier: KycTier = 'tier1';
  if (user?.kycTier3Verified) tier = 'tier3';
  else if (user?.kycTier2Verified) tier = 'tier2';
  else if (user?.kycTier1Verified) tier = 'tier1';

  const limits = await prisma.kycLimits.findUnique({ where: { tier } });
  const parse = (v: string | null | undefined) => {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    tier,
    depositDaily: parse(limits?.depositDailyLimit),
    depositMonthly: parse(limits?.depositMonthlyLimit),
    withdrawalDaily: parse(limits?.withdrawalDailyLimit),
    withdrawalMonthly: parse(limits?.withdrawalMonthlyLimit),
  };
}
