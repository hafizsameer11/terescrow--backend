import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { premblyConfig } from '../../services/prembly/prembly.config';
import { verifyTier3WithPrembly } from '../../services/prembly/prembly.kyc.service';

/**
 * Submit Tier 3 KYC Verification
 * POST /api/v2/kyc/tier3/submit
 *
 * BVN + proof of residence → Prembly BVN+face → auto-approve on pass.
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

    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier2');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must complete Tier 2 (Busha-approved) first'));
    }

    const isTier3Verified = await kycStatusService.isTierVerified(user.id, 'tier3');
    if (isTier3Verified) {
      return next(ApiError.badRequest('Tier 3 is already verified'));
    }

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

    const selfieFile = files?.['selfie']?.[0];
    let selfieUrl = selfieFile?.filename ? `uploads/${selfieFile.filename}` : null;

    if (!selfieUrl) {
      const tier2 = await prisma.kycStateTwo.findFirst({
        where: { userId: user.id, tier: 'tier2', state: 'approved' },
        orderBy: { createdAt: 'desc' },
      });
      selfieUrl = tier2?.selfieUrl || null;
    }

    if (!selfieUrl) {
      return next(ApiError.badRequest('Selfie is required'));
    }

    const bvnClean = String(bvn).replace(/\s+/g, '');
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

    if (!firstName || !lastName || !dob) {
      return next(ApiError.badRequest('Tier 2 identity details are incomplete'));
    }

    let submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier3',
        bvn: bvnClean,
        firtName: firstName,
        surName: lastName,
        dob,
        proofOfAddressUrl,
        selfieUrl,
        nin: tier2?.nin || null,
        address: tier2?.address || null,
        country: tier2?.country || null,
        documentType: tier2?.documentType || null,
        documentNumber: tier2?.documentNumber || null,
        status: 'tier3',
        state: 'pending',
      },
    });

    if (!premblyConfig.isEnabled() || !premblyConfig.isConfigured()) {
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'approved',
          reason: 'Prembly disabled — Tier 3 auto-approved for testing',
          premblyVerified: false,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          kycTier3Verified: true,
          currentKycTier: 'tier3',
        },
      });

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            submissionId: submission.id,
            tier: 'tier3',
            status: 'approved',
            message: 'Tier 3 approved (Prembly temporarily disabled).',
          },
          'Tier 3 KYC approved'
        )
      );
    }

    let premblyResult;
    try {
      premblyResult = await verifyTier3WithPrembly({
        firstName,
        lastName,
        dob,
        bvn: bvnClean,
        selfieRelativePath: selfieUrl,
      });
    } catch (error: any) {
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'rejected',
          reason: error?.message || 'Prembly verification failed',
          premblyVerified: false,
          premblyPayload: { error: error?.message || 'Prembly error', data: error?.data } as any,
        },
      });
      return next(
        ApiError.badRequest(error?.message || 'Identity verification failed. Please retry.')
      );
    }

    if (!premblyResult.passed) {
      const reason = premblyResult.failureReasons.join('; ') || 'Identity verification failed';
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'rejected',
          reason,
          premblyVerified: false,
          premblyReference: premblyResult.reference,
          premblyBvnConfidence: premblyResult.bvnConfidence,
          premblyPayload: premblyResult.raw as any,
        },
      });
      return next(ApiError.badRequest(reason));
    }

    const verified = premblyResult.verified!;

    submission = await prisma.kycStateTwo.update({
      where: { id: submission.id },
      data: {
        state: 'approved',
        reason: 'Verified via Prembly (BVN + face match)',
        bvn: bvnClean,
        premblyVerified: true,
        premblyReference: premblyResult.reference,
        premblyBvnConfidence: premblyResult.bvnConfidence,
        premblyVerifiedFirstName: verified.firstName,
        premblyVerifiedLastName: verified.lastName,
        premblyVerifiedDob: verified.birthDate,
        premblyPhone: verified.phone || null,
        premblyGender: verified.gender || null,
        premblyPayload: premblyResult.raw as any,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycTier3Verified: true,
        currentKycTier: 'tier3',
      },
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          submissionId: submission.id,
          tier: 'tier3',
          status: 'approved',
          premblyVerified: true,
          premblyReference: premblyResult.reference,
          bvnFaceConfidence: premblyResult.bvnConfidence,
          message: 'Tier 3 verified successfully.',
        },
        'Tier 3 KYC verification successful'
      )
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
        new ApiResponse(
          200,
          {
            tier: 'tier3',
            status: 'unverified',
            submission: null,
          },
          'No Tier 3 submission found'
        )
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          tier: 'tier3',
          status: submission.state,
          submission: {
            id: submission.id,
            state: submission.state,
            reason: submission.reason,
            premblyVerified: (submission as any).premblyVerified ?? false,
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
