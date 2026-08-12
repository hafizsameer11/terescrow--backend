import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import {
  getBushaStatusForAdmin,
  upsertBushaSettings,
  syncBushaPayoutRecipient,
  listBushaCustomers,
  getBushaCustomer,
  createBushaCustomer,
  submitBushaCustomerKyc,
  verifyBushaCustomer,
  refreshBushaCustomer,
  previewBushaQuote,
  executeBushaBuy,
  executeBushaSell,
  listBushaTrades,
  getBushaTrade,
  refreshBushaTrade,
} from '../../services/admin/busha.admin.service';

export async function getBushaStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaStatusForAdmin();
    return new ApiResponse(200, data, 'Busha status fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha status'));
  }
}

export async function putBushaSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const saved = await upsertBushaSettings(req.body ?? {});
    return new ApiResponse(200, saved, 'Busha settings saved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to save Busha settings'));
  }
}

export async function syncBushaRecipientController(req: Request, res: Response, next: NextFunction) {
  try {
    const { profileId } = req.body ?? {};
    if (!profileId) throw ApiError.badRequest('profileId is required');
    const data = await syncBushaPayoutRecipient(String(profileId));
    return new ApiResponse(200, data, 'Busha payout recipient synced').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to sync Busha recipient'));
  }
}

export async function listBushaCustomersController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listBushaCustomers();
    return new ApiResponse(200, data, 'Busha customers fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha customers'));
  }
}

export async function createBushaCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { email, firstName, lastName, phone, countryId, birthDate } = req.body ?? {};
    const data = await createBushaCustomer({
      adminUserId: admin.id,
      email,
      firstName,
      lastName,
      phone,
      countryId,
      birthDate,
    });
    return new ApiResponse(201, data, 'Busha customer created').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to create Busha customer'));
  }
}

export async function getBushaCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaCustomer(req.params.id);
    return new ApiResponse(200, data, 'Busha customer fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha customer'));
  }
}

function parseKycBody(body: Record<string, unknown> | undefined) {
  if (!body) return undefined;
  const { documentType, documentNumber, selfieBase64, documentImageBase64, birthDate } = body;
  if (!documentType && !documentNumber && !selfieBase64) return undefined;
  return {
    documentType: documentType as 'national-id' | 'passport' | 'drivers-license',
    documentNumber: String(documentNumber || ''),
    selfieBase64: String(selfieBase64 || ''),
    documentImageBase64: documentImageBase64 ? String(documentImageBase64) : undefined,
    birthDate: birthDate ? String(birthDate) : undefined,
  };
}

export async function submitBushaCustomerKycController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentType, documentNumber, selfieBase64, documentImageBase64, birthDate } = req.body ?? {};
    if (!documentType || !documentNumber || !selfieBase64) {
      throw ApiError.badRequest('documentType, documentNumber, and selfieBase64 are required');
    }
    const data = await submitBushaCustomerKyc(req.params.id, {
      documentType,
      documentNumber: String(documentNumber),
      selfieBase64: String(selfieBase64),
      documentImageBase64: documentImageBase64 ? String(documentImageBase64) : undefined,
      birthDate: birthDate ? String(birthDate) : undefined,
    });
    return new ApiResponse(200, data, 'Busha customer KYC submitted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to submit Busha customer KYC'));
  }
}

export async function verifyBushaCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const kyc = parseKycBody(req.body);
    const data = await verifyBushaCustomer(req.params.id, kyc);
    return new ApiResponse(200, data, 'Busha customer verification submitted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to verify Busha customer'));
  }
}

export async function refreshBushaCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await refreshBushaCustomer(req.params.id);
    return new ApiResponse(200, data, 'Busha customer refreshed').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to refresh Busha customer'));
  }
}

export async function previewBushaQuoteController(req: Request, res: Response, next: NextFunction) {
  try {
    const { customerId, side, sourceCurrency, targetCurrency, amount, amountField, fundingMethod } =
      req.body ?? {};
    if (!customerId || !side || !sourceCurrency || !targetCurrency || !amount) {
      throw ApiError.badRequest('customerId, side, sourceCurrency, targetCurrency, and amount are required');
    }
    const data = await previewBushaQuote({
      customerId,
      side,
      sourceCurrency,
      targetCurrency,
      amount: String(amount),
      amountField,
      fundingMethod,
    });
    return new ApiResponse(200, data, 'Busha quote preview').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to preview Busha quote'));
  }
}

export async function executeBushaBuyController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { customerId, sourceCurrency, targetCurrency, sourceAmount, autoPalmpayPayout } = req.body ?? {};
    if (!customerId || !sourceCurrency || !targetCurrency || !sourceAmount) {
      throw ApiError.badRequest('customerId, sourceCurrency, targetCurrency, and sourceAmount are required');
    }
    const data = await executeBushaBuy({
      adminUserId: admin.id,
      customerId,
      sourceCurrency,
      targetCurrency,
      sourceAmount: String(sourceAmount),
      autoPalmpayPayout,
    });
    return new ApiResponse(200, data, 'Busha buy initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha buy'));
  }
}

export async function executeBushaSellController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { customerId, sourceCurrency, targetCurrency, sourceAmount, fundingMethod } = req.body ?? {};
    if (!customerId || !sourceCurrency || !targetCurrency || !sourceAmount) {
      throw ApiError.badRequest('customerId, sourceCurrency, targetCurrency, and sourceAmount are required');
    }
    const data = await executeBushaSell({
      adminUserId: admin.id,
      customerId,
      sourceCurrency,
      targetCurrency,
      sourceAmount: String(sourceAmount),
      fundingMethod,
    });
    return new ApiResponse(200, data, 'Busha sell initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha sell'));
  }
}

export async function listBushaTradesController(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const data = await listBushaTrades(limit);
    return new ApiResponse(200, data, 'Busha trades fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha trades'));
  }
}

export async function getBushaTradeController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaTrade(req.params.id);
    return new ApiResponse(200, data, 'Busha trade fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha trade'));
  }
}

export async function refreshBushaTradeController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await refreshBushaTrade(req.params.id);
    return new ApiResponse(200, data, 'Busha trade refreshed').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to refresh Busha trade'));
  }
}
