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

  // Save identity data and keep Tier 2 pending for admin review.
  // Do NOT create / push a Busha customer — platform is shifting to Obiex.
  // Users who already have a Busha account keep access via existing customer row.
  await prisma.kycStateTwo.update({
    where: { id: submissionId },
    data: {
      premblyVerified: true,
      reason: 'Submitted — awaiting admin review',
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

/** @deprecated Use enqueueTier2BushaProcessing */
export function enqueueTier2PremblyProcessing(submissionId: number): void {
  enqueueTier2BushaProcessing(submissionId);
}

/**
 * Fire-and-forget: persist Tier 2 fields, leave state pending for admin.
 * No Busha customer create / submit (Obiex migration).
 */
export function enqueueTier2BushaProcessing(submissionId: number): void {
  setImmediate(() => {
    processTier2BushaSubmission(submissionId).catch((err) => {
      console.error(`[KYC Tier2] async processing failed for submission ${submissionId}:`, err);
    });
  });
}
