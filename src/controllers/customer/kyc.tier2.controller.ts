import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { enqueueTier2PremblyProcessing } from '../../services/kyc/kyc.tier2.process.service';
import { notifyUserKycSubmitted } from '../../services/kyc/kyc.notification.service';
import { assertNinAvailable } from '../../services/kyc/kyc.identity.guard.service';

/**
 * Submit Tier 2 KYC — async flow.
 * App sends name, DOB, NIN, selfie → immediate "submitted" response.
 * Prembly NIN+face runs in background; pass → approve + notify, fail → reject + reason.
 * No Busha customer create/submit.
 */
export const submitTier2Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user || (req as any).user;

    if (!user || !user.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { firstName, surName, dob, nin } = req.body;

    if (!firstName || !surName || !dob || !nin) {
      return next(ApiError.badRequest('First name, last name, date of birth, and NIN are required'));
    }

    const first = String(firstName).trim();
    const last = String(surName).trim();

    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier1');
    if (!canUpgrade) {
      return next(ApiError.badRequest('Complete registration first'));
    }

    if (await kycStatusService.isTierVerified(user.id, 'tier2')) {
      return next(ApiError.badRequest('Tier 2 is already verified'));
    }

    const pendingSubmission = await prisma.kycStateTwo.findFirst({
      where: { userId: user.id, tier: 'tier2', state: 'pending' },
    });
    if (pendingSubmission) {
      return next(ApiError.badRequest('Your Tier 2 verification is already being processed'));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const selfieFile = files?.['selfie']?.[0];
    const selfieUrl = selfieFile?.filename ? `uploads/${selfieFile.filename}` : null;
    if (!selfieUrl) {
      return next(ApiError.badRequest('Selfie is required'));
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phoneNumber: true, country: true },
    });

    const ninClean = String(nin).replace(/\s+/g, '');
    if (!/^\d{11}$/.test(ninClean)) {
      return next(ApiError.badRequest('NIN must be exactly 11 digits'));
    }
    await assertNinAvailable(ninClean, user.id);

    const dobClean = String(dob).trim();
    const phoneClean = String(profile?.phoneNumber || user.phoneNumber || '').trim();

    const submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier2',
        nin: ninClean,
        firtName: first,
        surName: last,
        dob: dobClean,
        country: String(profile?.country || user.country || 'Nigeria').trim(),
        premblyPhone: phoneClean || null,
        selfieUrl,
        status: 'tier2',
        state: 'pending',
        premblyVerified: false,
        reason: 'Submitted — verifying identity',
      },
    });

    enqueueTier2PremblyProcessing(submission.id);
    notifyUserKycSubmitted(user.id, 'tier2').catch(console.error);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          submissionId: submission.id,
          tier: 'tier2',
          status: 'submitted',
          message:
            'Verification submitted successfully. We will notify you when verification is complete.',
        },
        'Tier 2 KYC submitted'
      )
    );
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    console.error('Tier 2 submission error:', error);
    return next(ApiError.internal(error.message || 'Failed to submit Tier 2 KYC'));
  }
};

export const getTier2StatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const submission = await prisma.kycStateTwo.findFirst({
      where: { userId: user.id, tier: 'tier2' },
      orderBy: { createdAt: 'desc' },
      // Omit premblyPayload — huge JSON causes MySQL sort_buffer OOM on ORDER BY.
      select: {
        id: true,
        userId: true,
        tier: true,
        state: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        nin: true,
        bvn: true,
        surName: true,
        firtName: true,
        dob: true,
        selfieUrl: true,
        idDocumentUrl: true,
        documentType: true,
        documentNumber: true,
        premblyVerified: true,
        premblyReference: true,
      },
    });

    if (!submission) {
      return res.status(200).json(
        new ApiResponse(
          200,
          { tier: 'tier2', status: 'unverified', submission: null },
          'No Tier 2 submission found'
        )
      );
    }

    const displayStatus = submission.state === 'pending' ? 'in_review' : submission.state;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          tier: 'tier2',
          status: displayStatus,
          submission: {
            id: submission.id,
            state: submission.state,
            reason: submission.reason,
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt,
          },
        },
        'Tier 2 status retrieved'
      )
    );
  } catch (error: any) {
    console.error('Get Tier 2 status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get Tier 2 status'));
  }
};
