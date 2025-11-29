import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';

/**
 * Submit Tier 3 KYC Verification
 * POST /api/v2/kyc/tier3/submit
 */
export const submitTier3Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    // Check if user can upgrade to tier 3 (must have tier 2 verified)
    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier2');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must verify Tier 2 first'));
    }

    // Check if tier 3 is already verified
    const isTier3Verified = await kycStatusService.isTierVerified(user.id, 'tier3');
    if (isTier3Verified) {
      return next(ApiError.badRequest('Tier 3 is already verified'));
    }

    // Check if there's a pending submission
    const pendingSubmission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier3',
        state: 'pending',
      },
    });

    if (pendingSubmission) {
      return next(ApiError.badRequest('You already have a pending Tier 3 submission'));
    }

    // Get file URL from multer (if uploaded)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const proofOfAddressFile = files?.['proofOfAddress']?.[0];
    // Multer saves files to 'uploads/' directory, use filename to construct URL
    const proofOfAddressUrl = proofOfAddressFile?.filename ? `uploads/${proofOfAddressFile.filename}` : null;

    if (!proofOfAddressUrl) {
      return next(ApiError.badRequest('Proof of address document is required'));
    }

    // Create Tier 3 submission
    const submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier3',
        proofOfAddressUrl: proofOfAddressUrl,
        status: 'tier3', // Legacy field
        state: 'pending',
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        submissionId: submission.id,
        tier: 'tier3',
        status: 'pending',
        message: 'Tier 3 submission received. Your proof of address is under review.',
      }, 'Tier 3 KYC submission successful')
    );
  } catch (error: any) {
    console.error('Tier 3 submission error:', error);
    return next(ApiError.internal(error.message || 'Failed to submit Tier 3 KYC'));
  }
};

/**
 * Get Tier 3 submission status
 * GET /api/v2/kyc/tier3/status
 */
export const getTier3StatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const submission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier3',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      return res.status(200).json(
        new ApiResponse(200, {
          tier: 'tier3',
          status: 'unverified',
          submission: null,
        }, 'No Tier 3 submission found')
      );
    }

    return res.status(200).json(
      new ApiResponse(200, {
        tier: 'tier3',
        status: submission.state,
        submission: {
          id: submission.id,
          state: submission.state,
          reason: submission.reason,
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
        },
      }, 'Tier 3 status retrieved')
    );
  } catch (error: any) {
    console.error('Get Tier 3 status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get Tier 3 status'));
  }
};

