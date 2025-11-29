import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { kycStatusService } from '../../services/kyc/kyc.status.service';

/**
 * Get KYC Status for all tiers
 * GET /api/v2/kyc/status
 */
export const getKycStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    const status = await kycStatusService.getUserKycStatus(user.id);

    return res.status(200).json(
      new ApiResponse(200, status, 'KYC status retrieved successfully')
    );
  } catch (error: any) {
    console.error('Get KYC status error:', error);
    return next(ApiError.internal(error.message || 'Failed to get KYC status'));
  }
};

