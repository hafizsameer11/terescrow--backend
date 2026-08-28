import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';
import { premblyConfig } from '../../services/prembly/prembly.config';
import { verifyTier2WithPrembly } from '../../services/prembly/prembly.kyc.service';

/**
 * Submit Tier 2 KYC — Identity verification
 * NIN + liveness selfie + government ID (passport or drivers license).
 * Personal details come from Tier 1 (registration).
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

    const { nin, documentType, documentNumber } = req.body;

    if (!nin || !documentType || !documentNumber) {
      return next(ApiError.badRequest('NIN, document type, and document number are required'));
    }

    if (documentType !== 'drivers_license' && documentType !== 'international_passport') {
      return next(
        ApiError.badRequest('Document type must be drivers_license or international_passport')
      );
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        firstname: true,
        lastname: true,
        phoneNumber: true,
        dateOfBirth: true,
        residentialAddress: true,
        country: true,
        kycTier1Verified: true,
      },
    });

    if (!profile) {
      return next(ApiError.notFound('User not found'));
    }

    if (!profile.kycTier1Verified) {
      return next(
        ApiError.badRequest(
          'Complete basic verification (registration profile) before upgrading to Tier 2'
        )
      );
    }

    const firstName = String(profile.firstname || '').trim();
    const surName = String(profile.lastname || '').trim();
    const dob = String(profile.dateOfBirth || '').trim();
    const address = String(profile.residentialAddress || '').trim();
    const country = String(profile.country || 'Nigeria').trim();
    const phoneClean = String(profile.phoneNumber || '').trim();

    if (!firstName || !surName || !dob || !address || !phoneClean) {
      return next(
        ApiError.badRequest(
          'Your profile is missing required Tier 1 details (name, date of birth, address, phone). Update your registration profile first.'
        )
      );
    }

    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier1');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must complete Tier 1 (basic verification) first'));
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
      return next(ApiError.badRequest('Selfie is required for liveness verification'));
    }

    const ninClean = String(nin).replace(/\s+/g, '');

    let submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier2',
        nin: ninClean,
        firtName: firstName,
        surName,
        dob,
        address,
        country,
        documentType: String(documentType),
        documentNumber: String(documentNumber).trim(),
        premblyPhone: phoneClean,
        selfieUrl,
        status: 'tier2',
        state: 'pending',
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

    if (!premblyConfig.isEnabled() || !premblyConfig.isConfigured()) {
      submission = await prisma.kycStateTwo.update({
        where: { id: submission.id },
        data: {
          state: 'pending',
          reason: premblyConfig.isEnabled()
            ? 'Prembly keys missing — awaiting Busha KYC'
            : 'Prembly disabled — awaiting Busha KYC',
          premblyVerified: true,
          premblyVerifiedFirstName: firstName,
          premblyVerifiedLastName: surName,
          premblyVerifiedDob: dob,
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
              'Identity verification is under review. You can trade after approval.',
          },
          'Tier 2 submitted — awaiting Busha KYC'
        )
      );
    }

    let premblyResult;
    try {
      premblyResult = await verifyTier2WithPrembly({
        firstName,
        lastName: surName,
        dob,
        nin: ninClean,
        phone: phoneClean,
        documentType: documentType as 'drivers_license' | 'international_passport',
        documentNumber: String(documentNumber).trim(),
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
        address: verified.residentialAddress || address,
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
          docFaceConfidence: premblyResult.docConfidence,
          verifiedIdentity: {
            firstName: verified.firstName,
            lastName: verified.lastName,
            dob: verified.birthDate,
          },
          bushaSyncQueued: true,
          message: 'Identity verification is under review. You can trade after approval.',
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
