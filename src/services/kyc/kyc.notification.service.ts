import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';

export async function notifyUserKycRejected(
  userId: number,
  tier: 'tier2' | 'tier3',
  reason: string
): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  const trimmed = (reason || 'Verification could not be completed.').slice(0, 500);

  await prisma.inAppNotification.create({
    data: {
      userId,
      title: `${tierLabel} verification declined`,
      description: trimmed,
      type: InAppNotificationType.customeer,
    },
  });
}

export async function notifyUserKycSubmitted(
  userId: number,
  tier: 'tier2' | 'tier3'
): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  await prisma.inAppNotification.create({
    data: {
      userId,
      title: `${tierLabel} submitted`,
      description:
        tier === 'tier2'
          ? 'We received your documents and will verify them shortly.'
          : 'We received your enhanced verification documents.',
      type: InAppNotificationType.customeer,
    },
  });
}

export async function notifyUserKycApproved(userId: number, tier: 'tier2' | 'tier3'): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  await prisma.inAppNotification.create({
    data: {
      userId,
      title: `${tierLabel} approved`,
      description:
        tier === 'tier2'
          ? 'Your identity is verified. You can now buy, sell, send, and receive crypto.'
          : 'Your enhanced verification is complete.',
      type: InAppNotificationType.customeer,
    },
  });
}
