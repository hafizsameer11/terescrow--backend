import { prisma } from '../../utils/prisma';
import { ensureV2UserSetup } from './ensure.v2.user.setup.service';

export interface AccountBootstrapPayload {
  pinSet: boolean;
  setup: {
    tier1Applied: boolean;
    fiatWalletEnsured: boolean;
    virtualAccountsQueued: boolean;
    referralCodeBackfilled: boolean;
    virtualAccountCount: number;
    fiatWalletCount: number;
    kycTier1Verified: boolean;
    hasReferralCode: boolean;
  };
}

export async function getAccountBootstrap(userId: number): Promise<AccountBootstrapPayload> {
  const setupResult = await ensureV2UserSetup(userId);

  const [user, virtualAccountCount, fiatWalletCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        pin: true,
        kycTier1Verified: true,
        referralCode: true,
      },
    }),
    prisma.virtualAccount.count({ where: { userId } }),
    prisma.fiatWallet.count({ where: { userId } }),
  ]);

  return {
    pinSet: !!user?.pin,
    setup: {
      ...setupResult,
      virtualAccountCount,
      fiatWalletCount,
      kycTier1Verified: user?.kycTier1Verified ?? false,
      hasReferralCode: !!user?.referralCode,
    },
  };
}
