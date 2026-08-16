import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { premblyConfig } from '../../services/prembly/prembly.config';
import { verifyTier2WithPrembly } from '../../services/prembly/prembly.kyc.service';

/**
 * Submit Tier 2 KYC Verification
 * POST /api/v2/kyc/tier2/submit
 *
 * Flow:
 * 1. Validate form + upload selfie + ID
 * 2. Save KycStateTwo row
 * 3. Prembly NIN+face + BVN+face (required when Prembly configured)
 * 4. On pass → auto-approve Tier 2 + store Prembly-verified identity
 * 5. Queue Busha KYC sync with full details (when Busha app active)
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

    const {
      firstName,
      surName,
      dob,
      address,
      country,
      nin,
      bvn,
      documentType,
      documentNumber,
    } = req.body;

    if (!firstName || !surName || !dob || !address || !country || !nin || !bvn || !documentType || !documentNumber) {
      return next(ApiError.badRequest('All fields are required'));
    }

    if (documentType !== 'drivers_license' && documentType !== 'international_passport') {
      return next(ApiError.badRequest('Document type must be drivers_license or international_passport'));
    }

    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier1');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must verify Tier 1 first'));
    }

    const isTier2Verified = await kycStatusService.isTierVerified(user.id, 'tier2');
    if (isTier2Verified) {
      return next(ApiError.badRequest('Tier 2 is already verified'));
    }

    const pendingSubmission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier2',
        state: 'pending',
      },
    });

    if (pendingSubmission) {
      return next(ApiError.badRequest('You already have a pending Tier 2 submission'));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const idDocumentFile = files?.['idDocument']?.[0];
    const selfieFile = files?.['selfie']?.[0];

    const idDocumentUrl = idDocumentFile?.filename ? `uploads/${idDocumentFile.filename}` : null;
    const selfieUrl = selfieFile?.filename ? `uploads/${selfieFile.filename}` : null;

    if (!idDocumentUrl || !selfieUrl) {
      return next(ApiError.badRequest('ID document and selfie are required'));
    }

    const ninClean = String(nin).replace(/\s+/g, '');
    const bvnClean = String(bvn).replace(/\s+/g, '');

    // Create submission first so files/paths are persisted even if Prembly fails
    let submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier2',
        bvn: bvnClean,
        nin: ninClean,
        firtName: String(firstName).trim(),
        surName: String(surName).trim(),
        dob: String(dob).trim(),
        address: String(address).trim(),
        country: String(country).trim(),
        documentType: String(documentType),
        documentNumber: String(documentNumber).trim(),
        idDocumentUrl,
        selfieUrl,
        status: 'tier2',
        state: 'pending',
      },
    });

    // Prembly hidden / not ready → auto-approve Tier 2 so other flows can be tested
    if (!premblyConfig.isEnabled() || !premblyConfig.isConfigured()) {
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'approved',
          reason: premblyConfig.isEnabled()
            ? 'Prembly keys missing — auto-approved for testing'
            : 'Prembly disabled (PREMBLY_ENABLED=false) — auto-approved for testing',
          premblyVerified: false,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstname: String(firstName).trim(),
          lastname: String(surName).trim(),
          kycTier2Verified: true,
          currentKycTier: 'tier2',
        },
      });

      setImmediate(() => {
        (async () => {
          try {
            const { getBushaConfigRow } = await import('../../services/busha/busha.trade.service');
            const { bushaConfig } = await import('../../services/busha/busha.config');
            const settings = await getBushaConfigRow();
            if (bushaConfig.isConfigured() && settings?.isActive) {
              const { startBushaKycFromTerescrowProfile } = await import(
                '../../services/busha/busha.kyc.service'
              );
              await startBushaKycFromTerescrowProfile(user.id);
            }
          } catch (err: any) {
            console.warn('[KYC→Busha] auto sync skipped/failed:', err?.message || err);
          }
        })();
      });

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            submissionId: submission.id,
            tier: 'tier2',
            status: 'approved',
            premblyConfigured: false,
            premblyEnabled: premblyConfig.isEnabled(),
            bushaSyncQueued: true,
            message:
              'Tier 2 approved (Prembly temporarily disabled for testing). You can continue with crypto / Busha.',
          },
          'Tier 2 KYC approved (Prembly skipped)'
        )
      );
    }

    let premblyResult;
    try {
      premblyResult = await verifyTier2WithPrembly({
        firstName: String(firstName).trim(),
        lastName: String(surName).trim(),
        dob: String(dob).trim(),
        nin: ninClean,
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
        ApiError.badRequest(error?.message || 'Identity verification failed. Please retry with a clear selfie.')
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
          premblyNinConfidence: premblyResult.ninConfidence,
          premblyBvnConfidence: premblyResult.bvnConfidence,
          premblyPayload: premblyResult.raw as any,
        },
      });
      return next(ApiError.badRequest(reason));
    }

    const verified = premblyResult.verified!;
    const shouldAutoApprove = premblyResult.autoApproved;

    submission = await prisma.kycStateTwo.update({
      where: { id: submission.id },
      data: {
        state: shouldAutoApprove ? 'approved' : 'pending',
        reason: shouldAutoApprove
          ? 'Verified via Prembly (NIN + BVN face match)'
          : 'Prembly passed; awaiting admin approval',
        // Prefer registry-verified legal names / DOB
        firtName: verified.firstName,
        surName: verified.lastName,
        dob: verified.birthDate,
        address: verified.residentialAddress || String(address).trim(),
        premblyVerified: true,
        premblyReference: premblyResult.reference,
        premblyNinConfidence: premblyResult.ninConfidence,
        premblyBvnConfidence: premblyResult.bvnConfidence,
        premblyVerifiedFirstName: verified.firstName,
        premblyVerifiedLastName: verified.lastName,
        premblyVerifiedDob: verified.birthDate,
        premblyPhone: verified.phone || null,
        premblyGender: verified.gender || null,
        premblyPayload: premblyResult.raw as any,
      },
    });

    if (shouldAutoApprove) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstname: verified.firstName,
          lastname: verified.lastName,
          kycTier2Verified: true,
          currentKycTier: 'tier2',
        },
      });

      // Push full KYC to Busha in background when Busha ramp is active
      setImmediate(() => {
        (async () => {
          try {
            const { getBushaConfigRow } = await import('../../services/busha/busha.trade.service');
            const { bushaConfig } = await import('../../services/busha/busha.config');
            const settings = await getBushaConfigRow();
            if (bushaConfig.isConfigured() && settings?.isActive) {
              const { startBushaKycFromTerescrowProfile } = await import(
                '../../services/busha/busha.kyc.service'
              );
              await startBushaKycFromTerescrowProfile(user.id);
            }
          } catch (err: any) {
            console.warn('[KYC→Busha] auto sync skipped/failed:', err?.message || err);
          }
        })();
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          submissionId: submission.id,
          tier: 'tier2',
          status: submission.state,
          premblyVerified: true,
          premblyReference: premblyResult.reference,
          ninFaceConfidence: premblyResult.ninConfidence,
          bvnFaceConfidence: premblyResult.bvnConfidence,
          verifiedIdentity: {
            firstName: verified.firstName,
            lastName: verified.lastName,
            dob: verified.birthDate,
          },
          bushaSyncQueued: shouldAutoApprove,
          message: shouldAutoApprove
            ? 'Identity verified. Tier 2 approved. Crypto KYC will sync to Busha when the ramp is active.'
            : 'Identity verified by Prembly. Awaiting final admin approval.',
        },
        'Tier 2 KYC verification successful'
      )
    );
  } catch (error: any) {
    console.error('Tier 2 submission error:', error);
    return next(ApiError.internal(error.message || 'Failed to submit Tier 2 KYC'));
  }
};

/**
 * Get Tier 2 submission status
 * GET /api/v2/kyc/tier2/status
 */
export const getTier2StatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const submission = await prisma.kycStateTwo.findFirst({
      where: {
        userId: user.id,
        tier: 'tier2',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            tier: 'tier2',
            status: 'unverified',
            submission: null,
          },
          'No Tier 2 submission found'
        )
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          tier: 'tier2',
          status: submission.state,
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
