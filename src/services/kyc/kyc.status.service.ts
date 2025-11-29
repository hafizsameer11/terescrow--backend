import { prisma } from '../../utils/prisma';
import { KycTier } from '@prisma/client';

/**
 * KYC Status Service
 * Handles KYC tier status, limits, and verification checks
 */
class KycStatusService {
  /**
   * Get user's KYC status for all tiers
   */
  async getUserKycStatus(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentKycTier: true,
        kycTier1Verified: true,
        kycTier2Verified: true,
        kycTier3Verified: true,
        kycTier4Verified: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get all tier limits
    const limits = await prisma.kycLimits.findMany({
      orderBy: { tier: 'asc' },
    });

    // Get pending submissions for each tier
    const pendingSubmissions = await prisma.kycStateTwo.findMany({
      where: {
        userId,
        state: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build tier status array
    const tiers = ['tier1', 'tier2', 'tier3', 'tier4'] as KycTier[];
    const tierStatuses = tiers.map((tier) => {
      const limit = limits.find((l) => l.tier === tier);
      const pendingSubmission = pendingSubmissions.find((s) => s.tier === tier);

      let status: 'verified' | 'pending' | 'unverified' = 'unverified';
      if (tier === 'tier1' && user.kycTier1Verified) {
        status = 'verified';
      } else if (tier === 'tier2' && user.kycTier2Verified) {
        status = 'verified';
      } else if (tier === 'tier3' && user.kycTier3Verified) {
        status = 'verified';
      } else if (tier === 'tier4' && user.kycTier4Verified) {
        status = 'verified';
      } else if (pendingSubmission) {
        status = 'pending';
      }

      return {
        tier,
        status,
        limits: {
          deposit: {
            daily: limit?.depositDailyLimit || '0',
            monthly: limit?.depositMonthlyLimit || '0',
          },
          withdrawal: {
            daily: limit?.withdrawalDailyLimit || '0',
            monthly: limit?.withdrawalMonthlyLimit || '0',
          },
        },
        canUpgrade: this.canUpgradeToTier(user, tier),
      };
    });

    return {
      currentTier: user.currentKycTier || 'tier1',
      tiers: tierStatuses,
    };
  }

  /**
   * Check if user can upgrade to a specific tier
   */
  private canUpgradeToTier(
    user: {
      kycTier1Verified: boolean;
      kycTier2Verified: boolean;
      kycTier3Verified: boolean;
      kycTier4Verified: boolean;
    },
    targetTier: KycTier
  ): boolean {
    switch (targetTier) {
      case 'tier1':
        return true; // Always available
      case 'tier2':
        return user.kycTier1Verified; // Need tier1 verified
      case 'tier3':
        return user.kycTier2Verified; // Need tier2 verified
      case 'tier4':
        return user.kycTier3Verified; // Need tier3 verified
      default:
        return false;
    }
  }

  /**
   * Get tier limits
   */
  async getTierLimits(tier: KycTier) {
    const limit = await prisma.kycLimits.findUnique({
      where: { tier },
    });

    if (!limit) {
      throw new Error(`KYC limits not found for tier ${tier}`);
    }

    return {
      deposit: {
        daily: limit.depositDailyLimit || '0',
        monthly: limit.depositMonthlyLimit || '0',
      },
      withdrawal: {
        daily: limit.withdrawalDailyLimit || '0',
        monthly: limit.withdrawalMonthlyLimit || '0',
      },
    };
  }

  /**
   * Check if user has verified a specific tier
   */
  async isTierVerified(userId: number, tier: KycTier): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        kycTier1Verified: true,
        kycTier2Verified: true,
        kycTier3Verified: true,
        kycTier4Verified: true,
      },
    });

    if (!user) return false;

    switch (tier) {
      case 'tier1':
        return user.kycTier1Verified;
      case 'tier2':
        return user.kycTier2Verified;
      case 'tier3':
        return user.kycTier3Verified;
      case 'tier4':
        return user.kycTier4Verified;
      default:
        return false;
    }
  }

  /**
   * Get user's current verified tier
   */
  async getCurrentTier(userId: number): Promise<KycTier> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentKycTier: true },
    });

    return user?.currentKycTier || 'tier1';
  }
}

// Export singleton instance
export const kycStatusService = new KycStatusService();

