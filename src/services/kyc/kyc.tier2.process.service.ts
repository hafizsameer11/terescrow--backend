import { prisma } from '../../utils/prisma';
import { premblyConfig } from '../prembly/prembly.config';
import { verifyTier2WithPrembly } from '../prembly/prembly.kyc.service';
import {
  notifyUserKycRejected,
} from './kyc.notification.service';

/**
 * Async Tier 2 verification: Prembly NIN+face, then Busha (only after Prembly pass).
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
    await prisma.kycStateTwo.update({
      where: { id: submissionId },
      data: {
        premblyVerified: true,
        reason: 'Queued for crypto KYC',
        premblyVerifiedFirstName: firstName,
        premblyVerifiedLastName: lastName,
        premblyVerifiedDob: dob,
        premblyPhone: phone,
      },
    });
    await queueBushaAfterPremblyPass(user.id);
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

  await prisma.kycStateTwo.update({
    where: { id: submissionId },
    data: {
      state: 'pending',
      reason: 'Identity check passed; awaiting crypto KYC approval',
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
      phoneNumber: verified.phone || phone || undefined,
    },
  });

  await queueBushaAfterPremblyPass(user.id);
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

async function queueBushaAfterPremblyPass(userId: number): Promise<void> {
  try {
    const { getBushaConfigRow } = await import('../busha/busha.trade.service');
    const { bushaConfig } = await import('../busha/busha.config');
    const settings = await getBushaConfigRow();
    if (!bushaConfig.isConfigured() || !settings?.isActive) {
      console.warn('[KYC→Busha] Busha not active — Tier 2 stays pending after Prembly pass');
      return;
    }
    const { startBushaKycFromTerescrowProfile } = await import('../busha/busha.kyc.service');
    await startBushaKycFromTerescrowProfile(userId);
  } catch (err: any) {
    console.warn('[KYC→Busha] queue after Prembly pass failed:', err?.message || err);
  }
}

/** Fire-and-forget async Tier 2 Prembly processing. */
export function enqueueTier2PremblyProcessing(submissionId: number): void {
  setImmediate(() => {
    processTier2PremblySubmission(submissionId).catch((err) => {
      console.error(`[KYC Tier2] async processing failed for submission ${submissionId}:`, err);
    });
  });
}
