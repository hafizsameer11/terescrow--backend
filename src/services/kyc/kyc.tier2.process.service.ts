import { prisma } from '../../utils/prisma';
import { notifyUserKycRejected } from './kyc.notification.service';

/**
 * Async Tier 2 verification: submit NIN + selfie straight to Busha (no Prembly).
 */
export async function processTier2BushaSubmission(submissionId: number): Promise<void> {
  const submission = await prisma.kycStateTwo.findUnique({ where: { id: submissionId } });
  if (!submission || submission.tier !== 'tier2') return;
  if (submission.state !== 'pending') return;

  const user = await prisma.user.findUnique({
    where: { id: submission.userId },
    select: { id: true, phoneNumber: true, kycTier2Verified: true },
  });
  if (!user || user.kycTier2Verified) return;

  const firstName = String(submission.firtName || '').trim();
  const lastName = String(submission.surName || '').trim();
  const dob = String(submission.dob || '').trim();
  const nin = String(submission.nin || '').replace(/\s+/g, '');
  const selfieUrl = submission.selfieUrl;
  const phone = submission.premblyPhone || user.phoneNumber || null;

  if (!firstName || !lastName || !dob || !nin || !selfieUrl) {
    await rejectTier2Submission(
      submissionId,
      user.id,
      'Submission is missing required identity fields'
    );
    return;
  }

  // Mark ready for Busha (legacy column kept for older readers; no Prembly call).
  await prisma.kycStateTwo.update({
    where: { id: submissionId },
    data: {
      premblyVerified: true,
      reason: 'Submitted — awaiting crypto KYC approval',
      premblyVerifiedFirstName: firstName,
      premblyVerifiedLastName: lastName,
      premblyVerifiedDob: dob,
      premblyPhone: phone,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstname: firstName,
      lastname: lastName,
      ...(phone ? { phoneNumber: phone } : {}),
    },
  });

  await queueBushaSubmission(user.id);
}

async function rejectTier2Submission(
  submissionId: number,
  userId: number,
  reason: string
): Promise<void> {
  await prisma.kycStateTwo.update({
    where: { id: submissionId },
    data: {
      state: 'rejected',
      reason,
      premblyVerified: false,
    },
  });
  await notifyUserKycRejected(userId, 'tier2', reason);
}

async function queueBushaSubmission(userId: number): Promise<void> {
  try {
    const { getBushaConfigRow } = await import('../busha/busha.trade.service');
    const { bushaConfig } = await import('../busha/busha.config');
    const settings = await getBushaConfigRow();
    if (!bushaConfig.isConfigured() || !settings?.isActive) {
      console.warn('[KYC→Busha] Busha not active — Tier 2 stays pending after submit');
      return;
    }
    const { startBushaKycFromTerescrowProfile } = await import('../busha/busha.kyc.service');
    await startBushaKycFromTerescrowProfile(userId);
  } catch (err: any) {
    console.warn('[KYC→Busha] queue after Tier 2 submit failed:', err?.message || err);
  }
}

/** @deprecated Use enqueueTier2BushaProcessing */
export function enqueueTier2PremblyProcessing(submissionId: number): void {
  enqueueTier2BushaProcessing(submissionId);
}

/** Fire-and-forget async Tier 2 → Busha processing. */
export function enqueueTier2BushaProcessing(submissionId: number): void {
  setImmediate(() => {
    processTier2BushaSubmission(submissionId).catch((err) => {
      console.error(`[KYC Tier2] async Busha processing failed for submission ${submissionId}:`, err);
    });
  });
}
