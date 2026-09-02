import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { notifyUserKycSubmitted } from '../../services/kyc/kyc.notification.service';

/**
 * Submit Tier 3 KYC — save only (manual review later).
 */
export const submitTier3Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user || (req as any).user;

    if (!user || !user.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    if (!(await kycStatusService.isTierVerified(user.id, 'tier2'))) {
      return next(ApiError.badRequest('Complete Tier 2 first'));
    }

    if (await kycStatusService.isTierVerified(user.id, 'tier3')) {
      return next(ApiError.badRequest('Tier 3 is already verified'));
    }

    const pendingSubmission = await prisma.kycStateTwo.findFirst({
      where: { userId: user.id, tier: 'tier3', state: 'pending' },
    });
    if (pendingSubmission) {
      return next(ApiError.badRequest('You already have a pending Tier 3 submission'));
    }

    const { bvn } = req.body;
    if (!bvn) {
      return next(ApiError.badRequest('BVN is required'));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const proofFile = files?.['proofOfAddress']?.[0];
    const proofOfAddressUrl = proofFile?.filename ? `uploads/${proofFile.filename}` : null;
    if (!proofOfAddressUrl) {
      return next(ApiError.badRequest('Proof of residence is required'));
    }

    const tier2 = await prisma.kycStateTwo.findFirst({
      where: { userId: user.id, tier: 'tier2', state: 'approved' },
      orderBy: { createdAt: 'desc' },
    });

    const firstName = (
      (tier2 as any)?.premblyVerifiedFirstName ||
      tier2?.firtName ||
      user.firstname ||
      ''
    ).trim();
    const lastName = (
      (tier2 as any)?.premblyVerifiedLastName ||
      tier2?.surName ||
      user.lastname ||
      ''
    ).trim();
    const dob = ((tier2 as any)?.premblyVerifiedDob || tier2?.dob || '').trim();

    const submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier3',
        bvn: String(bvn).replace(/\s+/g, ''),
        firtName: firstName,
        surName: lastName,
        dob,
        proofOfAddressUrl,
        selfieUrl: tier2?.selfieUrl || null,
        nin: tier2?.nin || null,
        address: tier2?.address || null,
        country: tier2?.country || null,
        status: 'tier3',
        state: 'pending',
        reason: 'Submitted — awaiting review',
      },
    });

    notifyUserKycSubmitted(user.id, 'tier3').catch(console.error);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          submissionId: submission.id,
          tier: 'tier3',
          status: 'submitted',
          message: 'Tier 3 documents submitted successfully.',
        },
        'Tier 3 KYC submitted'
      )
    );
  } catch (error: any) {
    console.error('Tier 3 submission error:', error);
    return next(ApiError.internal(error.message || 'Failed to submit Tier 3 KYC'));
  }
};

export const getTier3StatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const submission = await prisma.kycStateTwo.findFirst({
      where: { userId: user.id, tier: 'tier3' },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      return res.status(200).json(
        new ApiResponse(
          200,
          { tier: 'tier3', status: 'unverified', submission: null },
          'No Tier 3 submission found'
        )
      );
    }

    const displayStatus =
      submission.state === 'pending' ? 'submitted' : submission.state;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          tier: 'tier3',
          status: displayStatus,
          submission: {
            id: submission.id,
            state: submission.state,
            reason: submission.reason,
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt,
          },
        },
        'Tier 3 status retrieved'
      )
    );
  } catch (error: any) {
    console.error('Get Tier 3 status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get Tier 3 status'));
  }
};
