import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';

/**
 * Submit Tier 4 KYC Verification
 * POST /api/v2/kyc/tier4/submit
 */
export const submitTier4Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    // Check if user can upgrade to tier 4 (must have tier 3 verified)
    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier3');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must verify Tier 3 first'));
    }

    // Check if tier 4 is already verified
    const isTier4Verified = await kycStatusService.isTierVerified(user.id, 'tier4');
    if (isTier4Verified) {
      return next(ApiError.badRequest('Tier 4 is already verified'));
    }

    // Check if there's a pending submission
    const pendingSubmission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier4',
        state: 'pending',
      },
    });

    if (pendingSubmission) {
      return next(ApiError.badRequest('You already have a pending Tier 4 submission'));
    }

    // Get file URL from multer (if uploaded)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const proofOfFundsFile = files?.['proofOfFunds']?.[0];
    // Multer saves files to 'uploads/' directory, use filename to construct URL
    const proofOfFundsUrl = proofOfFundsFile?.filename ? `uploads/${proofOfFundsFile.filename}` : null;

    if (!proofOfFundsUrl) {
      return next(ApiError.badRequest('Proof of funds document is required'));
    }

    // Create Tier 4 submission
    const submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier4',
        proofOfFundsUrl: proofOfFundsUrl,
        status: 'tier4', // Legacy field
        state: 'pending',
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        submissionId: submission.id,
        tier: 'tier4',
        status: 'pending',
        message: 'Tier 4 submission received. Your proof of funds is under review.',
      }, 'Tier 4 KYC submission successful')
    );
  } catch (error: any) {
    console.error('Tier 4 submission error:', error);
    return next(ApiError.internal(error.message || 'Failed to submit Tier 4 KYC'));
  }
};

/**
 * Get Tier 4 submission status
 * GET /api/v2/kyc/tier4/status
 */
export const getTier4StatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const submission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier4',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      return res.status(200).json(
        new ApiResponse(200, {
          tier: 'tier4',
          status: 'unverified',
          submission: null,
        }, 'No Tier 4 submission found')
      );
    }

    return res.status(200).json(
      new ApiResponse(200, {
        tier: 'tier4',
        status: submission.state,
        submission: {
          id: submission.id,
          state: submission.state,
          reason: submission.reason,
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
        },
      }, 'Tier 4 status retrieved')
    );
  } catch (error: any) {
    console.error('Get Tier 4 status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get Tier 4 status'));
  }
};

