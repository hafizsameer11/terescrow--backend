import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { enqueueTier2PremblyProcessing } from '../../services/kyc/kyc.tier2.process.service';
import { notifyUserKycSubmitted } from '../../services/kyc/kyc.notification.service';

/**
 * Submit Tier 2 KYC — async flow.
 * User submits name, DOB, NIN, selfie → immediate "submitted" response.
 * Prembly runs in background; Busha only after Prembly pass.
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
      return next(ApiError.badRequest('Full name, date of birth, and NIN are required'));
    }

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
    const first = String(firstName).trim();
    const last = String(surName).trim();
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
        reason: 'Submitted — awaiting verification',
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
            'Verification submitted successfully. We will notify you when review is complete.',
        },
        'Tier 2 KYC submitted'
      )
    );
  } catch (error: any) {
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

    let displayStatus = submission.state;
    if (submission.state === 'pending') {
      displayStatus = (submission as any).premblyVerified ? 'in_review' : 'submitted';
    }

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
            premblyVerified: (submission as any).premblyVerified ?? false,
            premblyReference: (submission as any).premblyReference ?? null,
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
