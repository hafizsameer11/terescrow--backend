import { UserRoles } from '@prisma/client';
import { v1Compat } from '../../config/v1.compat.config';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { prisma } from '../../utils/prisma';

export interface V2SetupStatus {
  tier1Applied: boolean;
  fiatWalletEnsured: boolean;
  virtualAccountsQueued: boolean;
  referralCodeBackfilled: boolean;
}

const DEFAULT_SETUP_STATUS: V2SetupStatus = {
  tier1Applied: false,
  fiatWalletEnsured: false,
  virtualAccountsQueued: false,
  referralCodeBackfilled: false,
};

/**
 * Idempotent backfill for v1 users (and any verified customer missing v2 records).
 * Safe to call on login, bootstrap, and wallet/asset reads.
 */
export async function ensureV2UserSetup(userId: number): Promise<V2SetupStatus> {
  if (!v1Compat.enableV2UserSetup) {
    return { ...DEFAULT_SETUP_STATUS };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isVerified: true,
      country: true,
      username: true,
      referralCode: true,
      kycTier1Verified: true,
    },
  });

  if (!user || user.role !== UserRoles.customer || !user.isVerified) {
    return { ...DEFAULT_SETUP_STATUS };
  }

  const status: V2SetupStatus = { ...DEFAULT_SETUP_STATUS };

  if (!user.kycTier1Verified) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        kycTier1Verified: true,
        currentKycTier: 'tier1',
      },
    });
    status.tier1Applied = true;
  }

  if (!user.referralCode && user.username) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: user.username },
      });
      status.referralCodeBackfilled = true;
    } catch (error) {
      console.warn(`[ensureV2UserSetup] referralCode backfill skipped for user ${userId}:`, error);
    }
  }

  const defaultCurrency = 'NGN';
  await fiatWalletService.getOrCreateWallet(userId, defaultCurrency);
  status.fiatWalletEnsured = true;

  const virtualAccountCount = await prisma.virtualAccount.count({
    where: { userId },
  });

  if (virtualAccountCount === 0) {
    const { queueManager } = await import('../../queue/queue.manager');
    const jobId = `create-virtual-account-${userId}`;
    try {
      await queueManager.addJob(
        'tatum',
        'create-virtual-account',
        { userId },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );
      status.virtualAccountsQueued = true;
    } catch (error: any) {
      const msg = String(error?.message || error);
      if (msg.includes('Job') && msg.includes('exists')) {
        console.log(`[ensureV2UserSetup] create-virtual-account already queued for user ${userId}`);
      } else {
        throw error;
      }
    }
  }

  return status;
}

export function triggerV2UserSetupIfNeeded(userId: number): void {
  ensureV2UserSetup(userId).catch((error) => {
    console.error(`[ensureV2UserSetup] background setup failed for user ${userId}:`, error);
  });
}
