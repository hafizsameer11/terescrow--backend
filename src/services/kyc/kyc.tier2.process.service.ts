import { prisma } from '../../utils/prisma';
import { premblyConfig } from '../prembly/prembly.config';
import { verifyTier2WithPrembly } from '../prembly/prembly.kyc.service';
import { notifyUserKycApproved, notifyUserKycRejected } from './kyc.notification.service';

/**
 * Async Tier 2 verification: Prembly NIN + face only.
 * No Busha customer create/submit (Obiex migration).
 * Pass → approve Tier 2 + notify. Fail → reject + notify with reason.
 */
export async function processTier2PremblySubmission(submissionId: number): Promise<void> {
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

  if (!premblyConfig.isEnabled() || !premblyConfig.isConfigured()) {
    console.error(
      `[KYC Tier2] Prembly disabled/unconfigured — leaving submission ${submissionId} pending for admin`
    );
    await prisma.kycStateTwo.update({
      where: { id: submissionId },
      data: {
        reason: 'Submitted — awaiting admin review (identity provider unavailable)',
        premblyVerified: false,
      },
    });
    return;
  }

  let premblyResult;
  try {
    premblyResult = await verifyTier2WithPrembly({
      firstName,
      lastName,
      dob,
      nin,
      phone,
      selfieRelativePath: selfieUrl,
    });
  } catch (error: any) {
    await rejectTier2Submission(
      submissionId,
      user.id,
      error?.message || 'Identity verification failed'
    );
    return;
  }

  if (!premblyResult.passed) {
    const reason = premblyResult.failureReasons.join('; ') || 'Identity verification failed';
    await prisma.kycStateTwo.update({
      where: { id: submissionId },
      data: {
        state: 'rejected',
        reason,
        premblyVerified: false,
        premblyReference: premblyResult.reference,
        premblyNinConfidence: premblyResult.ninConfidence,
        premblyPayload: premblyResult.raw as any,
      },
    });
    await notifyUserKycRejected(user.id, 'tier2', reason);
    return;
  }

  const verified = premblyResult.verified!;
  const autoApprove = premblyConfig.autoApproveOnPass();

  await prisma.kycStateTwo.update({
    where: { id: submissionId },
    data: {
      state: autoApprove ? 'approved' : 'pending',
      reason: autoApprove
        ? 'Verified via Prembly'
        : 'Identity check passed; awaiting admin review',
      firtName: verified.firstName,
      surName: verified.lastName,
      dob: verified.birthDate,
      address: verified.residentialAddress || submission.address,
      premblyVerified: true,
      premblyReference: premblyResult.reference,
      premblyNinConfidence: premblyResult.ninConfidence,
      premblyVerifiedFirstName: verified.firstName,
      premblyVerifiedLastName: verified.lastName,
      premblyVerifiedDob: verified.birthDate,
      premblyPhone: verified.phone || phone,
      premblyGender: verified.gender || null,
      premblyPayload: premblyResult.raw as any,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstname: verified.firstName,
      lastname: verified.lastName,
      ...(verified.phone || phone ? { phoneNumber: verified.phone || phone || undefined } : {}),
      ...(autoApprove
        ? { kycTier2Verified: true, currentKycTier: 'tier2' }
        : {}),
    },
  });

  if (autoApprove) {
    notifyUserKycApproved(user.id, 'tier2').catch(console.error);
  }
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

/** @deprecated alias — Prembly is the Tier 2 verifier again */
export function enqueueTier2BushaProcessing(submissionId: number): void {
  enqueueTier2PremblyProcessing(submissionId);
}

/**
 * Fire-and-forget: Prembly NIN+face, then approve or reject + notify.
 */
export function enqueueTier2PremblyProcessing(submissionId: number): void {
  setImmediate(() => {
    processTier2PremblySubmission(submissionId).catch((err) => {
      console.error(`[KYC Tier2] Prembly processing failed for submission ${submissionId}:`, err);
    });
  });
}
