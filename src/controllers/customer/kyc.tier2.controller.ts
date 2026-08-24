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
 * 1. Validate form + upload selfie (Busha-ready fields: names, phone, DOB, address, NIN)
 * 2. Save KycStateTwo row
 * 3. Prembly NIN+face (when configured)
 * 4. On Prembly pass → keep pending, start Busha KYC; Tier 2 approved only when Busha is active
 * 5. On Prembly fail → rejected with reasons immediately
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

    const { firstName, surName, dob, address, country, nin, phone } = req.body;

    if (!firstName || !surName || !dob || !address || !country || !nin) {
      return next(ApiError.badRequest('All fields are required'));
    }

    const phoneClean = String(phone || user.phoneNumber || '').trim();
    if (!phoneClean) {
      return next(ApiError.badRequest('Phone number is required'));
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
    const selfieFile = files?.['selfie']?.[0];
    const selfieUrl = selfieFile?.filename ? `uploads/${selfieFile.filename}` : null;

    if (!selfieUrl) {
      return next(ApiError.badRequest('Selfie is required'));
    }

    const ninClean = String(nin).replace(/\s+/g, '');

    let submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier2',
        nin: ninClean,
        firtName: String(firstName).trim(),
        surName: String(surName).trim(),
        dob: String(dob).trim(),
        address: String(address).trim(),
        country: String(country).trim(),
        premblyPhone: phoneClean,
        selfieUrl,
        status: 'tier2',
        state: 'pending',
      },
    });

    // Update user phone if provided
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneNumber: phoneClean,
        firstname: String(firstName).trim(),
        lastname: String(surName).trim(),
      },
    });

    const queueBusha = () => {
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
    };

    // Prembly disabled → still start Busha; Tier 2 stays pending until Busha active
    if (!premblyConfig.isEnabled() || !premblyConfig.isConfigured()) {
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'pending',
          reason: premblyConfig.isEnabled()
            ? 'Prembly keys missing — awaiting Busha KYC'
            : 'Prembly disabled — awaiting Busha KYC',
          premblyVerified: true,
          premblyVerifiedFirstName: String(firstName).trim(),
          premblyVerifiedLastName: String(surName).trim(),
          premblyVerifiedDob: String(dob).trim(),
          premblyPhone: phoneClean,
        },
      });

      queueBusha();

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            submissionId: submission.id,
            tier: 'tier2',
            status: 'in_review',
            premblyConfigured: false,
            premblyEnabled: premblyConfig.isEnabled(),
            bushaSyncQueued: true,
            message:
              'KYC is under review. You can trade after verification is approved.',
          },
          'Tier 2 submitted — awaiting Busha KYC'
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
        phone: phoneClean,
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
        ApiError.badRequest(
          error?.message || 'Identity verification failed. Please retry with a clear selfie.'
        )
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
          premblyPayload: premblyResult.raw as any,
        },
      });
      return next(ApiError.badRequest(reason));
    }

    const verified = premblyResult.verified!;

    submission = await prisma.kycStateTwo.update({
      where: { id: submission.id },
      data: {
        state: 'pending',
        reason: 'Prembly passed; awaiting Busha KYC approval',
        firtName: verified.firstName,
        surName: verified.lastName,
        dob: verified.birthDate,
        address: verified.residentialAddress || String(address).trim(),
        premblyVerified: true,
        premblyReference: premblyResult.reference,
        premblyNinConfidence: premblyResult.ninConfidence,
        premblyVerifiedFirstName: verified.firstName,
        premblyVerifiedLastName: verified.lastName,
        premblyVerifiedDob: verified.birthDate,
        premblyPhone: verified.phone || phoneClean,
        premblyGender: verified.gender || null,
        premblyPayload: premblyResult.raw as any,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstname: verified.firstName,
        lastname: verified.lastName,
        phoneNumber: verified.phone || phoneClean,
      },
    });

    queueBusha();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          submissionId: submission.id,
          tier: 'tier2',
          status: 'in_review',
          premblyVerified: true,
          premblyReference: premblyResult.reference,
          ninFaceConfidence: premblyResult.ninConfidence,
          verifiedIdentity: {
            firstName: verified.firstName,
            lastName: verified.lastName,
            dob: verified.birthDate,
          },
          bushaSyncQueued: true,
          message: 'KYC is under review. You can trade after verification is approved.',
        },
        'Identity verified by Prembly — awaiting Busha KYC'
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

    const displayStatus =
      submission.state === 'pending' && (submission as any).premblyVerified
        ? 'in_review'
        : submission.state;

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
