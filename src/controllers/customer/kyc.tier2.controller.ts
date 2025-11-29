import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { kycStatusService } from '../../services/kyc/kyc.status.service';

/**
 * Submit Tier 2 KYC Verification
 * POST /api/v2/kyc/tier2/submit
 */
export const submitTier2Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
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

    // Validate required fields
    if (!firstName || !surName || !dob || !address || !country || !nin || !bvn || !documentType || !documentNumber) {
      return next(ApiError.badRequest('All fields are required'));
    }

    // Validate document type
    if (documentType !== 'drivers_license' && documentType !== 'international_passport') {
      return next(ApiError.badRequest('Document type must be drivers_license or international_passport'));
    }

    // Check if user can upgrade to tier 2
    const canUpgrade = await kycStatusService.isTierVerified(user.id, 'tier1');
    if (!canUpgrade) {
      return next(ApiError.badRequest('You must verify Tier 1 first'));
    }

    // Check if tier 2 is already verified
    const isTier2Verified = await kycStatusService.isTierVerified(user.id, 'tier2');
    if (isTier2Verified) {
      return next(ApiError.badRequest('Tier 2 is already verified'));
    }

    // Check if there's a pending submission
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

    // Get file URLs from multer (if uploaded)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const idDocumentFile = files?.['idDocument']?.[0];
    const selfieFile = files?.['selfie']?.[0];
    
    // Multer saves files to 'uploads/' directory, use filename to construct URL
    const idDocumentUrl = idDocumentFile?.filename ? `uploads/${idDocumentFile.filename}` : null;
    const selfieUrl = selfieFile?.filename ? `uploads/${selfieFile.filename}` : null;

    if (!idDocumentUrl || !selfieUrl) {
      return next(ApiError.badRequest('ID document and selfie are required'));
    }

    // Create Tier 2 submission
    const submission = await prisma.kycStateTwo.create({
      data: {
        userId: user.id,
        tier: 'tier2',
        bvn: bvn,
        nin: nin,
        firtName: firstName, // Note: using existing field name with typo
        surName: surName,
        dob: dob,
        address: address,
        country: country,
        documentType: documentType,
        documentNumber: documentNumber,
        idDocumentUrl: idDocumentUrl,
        selfieUrl: selfieUrl,
        status: 'tier2', // Legacy field
        state: 'pending',
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        submissionId: submission.id,
        tier: 'tier2',
        status: 'pending',
        message: 'Tier 2 submission received. An OTP will be sent to the number registered on your BVN.',
      }, 'Tier 2 KYC submission successful')
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
        new ApiResponse(200, {
          tier: 'tier2',
          status: 'unverified',
          submission: null,
        }, 'No Tier 2 submission found')
      );
    }

    return res.status(200).json(
      new ApiResponse(200, {
        tier: 'tier2',
        status: submission.state, // pending, approved, rejected
        submission: {
          id: submission.id,
          state: submission.state,
          reason: submission.reason,
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
        },
      }, 'Tier 2 status retrieved')
    );
  } catch (error: any) {
    console.error('Get Tier 2 status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get Tier 2 status'));
  }
};

