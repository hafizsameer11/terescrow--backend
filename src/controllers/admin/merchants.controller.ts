import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import {
  getMerchantsOverview,
  getStroWalletSettingsForAdmin,
  upsertStroWalletTopupSettings,
  topUpStroWalletViaPalmpay,
  listPalmpayBanksForAdmin,
  verifyPalmpayBankAccountForAdmin,
} from '../../services/admin/merchants.admin.service';

export async function getMerchantsOverviewController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await getMerchantsOverview();
    return new ApiResponse(200, data, 'Merchants overview fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch merchants overview'));
  }
}

export async function getStroWalletConfigController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await getStroWalletSettingsForAdmin();
    return new ApiResponse(200, data, 'StroWallet settings fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch StroWallet settings'));
  }
}

export async function putStroWalletConfigController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      topupBankCode,
      topupBankName,
      topupAccountNumber,
      topupAccountName,
      isActive,
      autoTopupEnabled,
      autoTopupThresholdNgn,
      autoTopupAmountNgn,
      autoTopupCooldownMinutes,
    } = req.body ?? {};

    const parseOptionalNgn = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };

    const saved = await upsertStroWalletTopupSettings({
      topupBankCode,
      topupBankName,
      topupAccountNumber,
      topupAccountName,
      isActive,
      autoTopupEnabled,
      autoTopupThresholdNgn: parseOptionalNgn(autoTopupThresholdNgn),
      autoTopupAmountNgn: parseOptionalNgn(autoTopupAmountNgn),
      autoTopupCooldownMinutes:
        autoTopupCooldownMinutes === undefined
          ? undefined
          : parseInt(String(autoTopupCooldownMinutes), 10),
    });

    return new ApiResponse(
      200,
      {
        topupBankCode: saved.topupBankCode,
        topupBankName: saved.topupBankName,
        topupAccountNumber: saved.topupAccountNumber,
        topupAccountName: saved.topupAccountName,
        isActive: saved.isActive,
        autoTopupEnabled: saved.autoTopupEnabled,
        autoTopupThresholdNgn:
          saved.autoTopupThresholdNgn != null
            ? Number(saved.autoTopupThresholdNgn)
            : null,
        autoTopupAmountNgn:
          saved.autoTopupAmountNgn != null ? Number(saved.autoTopupAmountNgn) : null,
        autoTopupCooldownMinutes: saved.autoTopupCooldownMinutes,
      },
      'StroWallet top-up settings saved'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to save StroWallet settings'));
  }
}

export async function topUpStroWalletController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const admin = (req as any).user;
    const { amount, bankCode, accountNumber, accountName, bankName } = req.body ?? {};

    const result = await topUpStroWalletViaPalmpay({
      adminUserId: admin.id,
      amount: parseFloat(amount),
      bankCode,
      accountNumber,
      accountName,
      bankName,
      trigger: 'manual',
    });

    return new ApiResponse(200, result, 'StroWallet top-up initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to initiate StroWallet top-up'));
  }
}

export async function getPalmpayBanksForMerchantsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const banks = await listPalmpayBanksForAdmin();
    return new ApiResponse(200, banks, 'Bank list fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch bank list'));
  }
}

export async function verifyPalmpayBankForMerchantsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { bankCode, accountNumber } = req.body ?? {};
    const result = await verifyPalmpayBankAccountForAdmin(bankCode, accountNumber);
    return new ApiResponse(200, result, 'Account verified').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to verify bank account'));
  }
}
