import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { sendPushNotification } from '../../utils/pushService';

async function createInAppAndPush(opts: {
  userId: number;
  title: string;
  description: string;
  data?: Record<string, string>;
}): Promise<void> {
  const { userId, title, description, data = {} } = opts;

  await prisma.inAppNotification.create({
    data: {
      userId,
      title,
      description,
      type: InAppNotificationType.customeer,
    },
  });

  await sendPushNotification({
    userId,
    title,
    body: description,
    sound: 'default',
    priority: 'high',
    data: { type: 'kyc', ...data },
  });
}

export async function notifyUserKycRejected(
  userId: number,
  tier: 'tier2' | 'tier3',
  reason: string
): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  const trimmed = (reason || 'Verification could not be completed.').slice(0, 500);

  await createInAppAndPush({
    userId,
    title: `${tierLabel} verification declined`,
    description: trimmed,
    data: { tier, status: 'rejected' },
  });
}

export async function notifyUserKycSubmitted(
  userId: number,
  tier: 'tier2' | 'tier3'
): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  const description =
    tier === 'tier2'
      ? 'We received your documents and will verify them shortly.'
      : 'We received your enhanced verification documents.';

  await createInAppAndPush({
    userId,
    title: `${tierLabel} submitted`,
    description,
    data: { tier, status: 'submitted' },
  });
}

export async function notifyUserKycApproved(userId: number, tier: 'tier2' | 'tier3'): Promise<void> {
  const tierLabel = tier === 'tier2' ? 'Tier 2' : 'Tier 3';
  const description =
    tier === 'tier2'
      ? 'Your identity is verified. You can now buy, sell, send, and receive crypto.'
      : 'Your enhanced verification is complete.';

  await createInAppAndPush({
    userId,
    title: `${tierLabel} approved`,
    description,
    data: { tier, status: 'approved' },
  });
}
