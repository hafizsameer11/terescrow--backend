import { Request, Response, NextFunction } from 'express';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import {
  ensureBushaCustomerForUser,
  getAppBushaProfile,
  getBushaAppPublicStatus,
  getBushaAppStatusForUser,
  submitAppBushaKyc,
  verifyAppBushaKyc,
  getAppBushaWallet,
  previewAppBushaSell,
  executeAppBushaSell,
  executeAppBushaBuy,
  executeAppBushaReceive,
  executeAppBushaSend,
  previewAppBushaSend,
  getAppBushaTrade,
  refreshAppBushaTrade,
  listAppBushaTrades,
} from '../../services/busha/busha.app.service';
import { startBushaKycForUser, getBushaKycStatusForUser, startBushaKycFromTerescrowProfile } from '../../services/busha/busha.kyc.service';
import { previewBushaQuote } from '../../services/busha/busha.trade.service';

function userId(req: Request): number {
  const user = (req as any).user || req.body._user;
  if (!user?.id) throw ApiError.unauthorized('Unauthorized');
  return user.id;
}

export async function getBushaStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    // Prefer authenticated status (includes KYC gate) when token present
    try {
      const uid = userId(req);
      const data = await getBushaAppStatusForUser(uid);
      return new ApiResponse(200, data, 'Busha app status').send(res);
    } catch (authErr) {
      if (authErr instanceof ApiError && authErr.status === 401) {
        const data = await getBushaAppPublicStatus();
        return new ApiResponse(200, data, 'Busha app status').send(res);
      }
      throw authErr;
    }
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha status'));
  }
}

export async function getBushaKycStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaKycStatusForUser(userId(req));
    return new ApiResponse(200, data, 'Busha KYC status').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha KYC status'));
  }
}

export async function startBushaKycController(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, birthDate, nin, selfieBase64 } = req.body ?? {};
    const uid = userId(req);

    // Default: use Terescrow Tier 2 KYC already on file (one KYC in app)
    if (!firstName && !lastName && !birthDate && !nin && !selfieBase64) {
      const data = await startBushaKycFromTerescrowProfile(uid);
      return new ApiResponse(200, data, 'Crypto activation started using your Terescrow KYC').send(res);
    }

    if (!firstName || !lastName || !birthDate || !nin || !selfieBase64) {
      throw ApiError.badRequest(
        'Complete Terescrow Tier 2 KYC first, or provide firstName, lastName, birthDate, nin, and selfieBase64'
      );
    }

    const data = await startBushaKycForUser(uid, {
      firstName: String(firstName),
      lastName: String(lastName),
      birthDate: String(birthDate),
      nin: String(nin),
      selfieBase64: String(selfieBase64),
    });
    return new ApiResponse(200, data, 'Busha KYC submitted for processing').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to start Busha KYC'));
  }
}

export async function getBushaProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAppBushaProfile(userId(req));
    return new ApiResponse(200, data, 'Busha profile fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha profile'));
  }
}

export async function ensureBushaProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const kyc = await getBushaKycStatusForUser(userId(req));
    if (kyc.needsKyc) {
      return new ApiResponse(200, { ...kyc, customer: null }, 'Busha KYC required').send(res);
    }
    const customer = await ensureBushaCustomerForUser(userId(req));
    return new ApiResponse(200, { ...kyc, customer }, 'Busha profile ready').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to ensure Busha profile'));
  }
}

export async function submitBushaKycController(req: Request, res: Response, next: NextFunction) {
  try {
    const { documentType, documentNumber, selfieBase64, documentImageBase64, birthDate } = req.body ?? {};
    if (!documentType || !documentNumber || !selfieBase64) {
      throw ApiError.badRequest('documentType, documentNumber, and selfieBase64 are required');
    }
    const data = await submitAppBushaKyc(userId(req), {
      documentType,
      documentNumber: String(documentNumber),
      selfieBase64: String(selfieBase64),
      documentImageBase64: documentImageBase64 ? String(documentImageBase64) : undefined,
      birthDate: birthDate ? String(birthDate) : undefined,
    });
    return new ApiResponse(200, data, 'Busha KYC submitted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to submit Busha KYC'));
  }
}

export async function verifyBushaKycController(req: Request, res: Response, next: NextFunction) {
  try {
    const { documentType, documentNumber, selfieBase64, documentImageBase64, birthDate } = req.body ?? {};
    const kyc =
      documentType && documentNumber && selfieBase64
        ? {
            documentType,
            documentNumber: String(documentNumber),
            selfieBase64: String(selfieBase64),
            documentImageBase64: documentImageBase64 ? String(documentImageBase64) : undefined,
            birthDate: birthDate ? String(birthDate) : undefined,
          }
        : undefined;
    const data = await verifyAppBushaKyc(userId(req), kyc as any);
    return new ApiResponse(200, data, 'Busha KYC verification submitted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to verify Busha KYC'));
  }
}

export async function getBushaWalletController(req: Request, res: Response, next: NextFunction) {
  try {
    const currency = req.query.currency ? String(req.query.currency) : undefined;
    const data = await getAppBushaWallet(userId(req), currency);
    return new ApiResponse(200, data, 'Busha wallet fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha wallet'));
  }
}

export async function previewBushaSellController(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceCurrency, sourceAmount, fundingMethod, network } = req.body ?? {};
    if (!sourceCurrency || !sourceAmount) {
      throw ApiError.badRequest('sourceCurrency and sourceAmount are required');
    }
    const data = await previewAppBushaSell(userId(req), {
      sourceCurrency,
      sourceAmount: String(sourceAmount),
      fundingMethod,
      network: network ? String(network) : undefined,
    });
    return new ApiResponse(200, data, 'Busha sell preview').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to preview Busha sell'));
  }
}

export async function executeBushaSellController(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceCurrency, sourceAmount, fundingMethod, network } = req.body ?? {};
    if (!sourceCurrency || !sourceAmount) {
      throw ApiError.badRequest('sourceCurrency and sourceAmount are required');
    }
    const data = await executeAppBushaSell(userId(req), {
      sourceCurrency,
      sourceAmount: String(sourceAmount),
      fundingMethod,
      network: network ? String(network) : undefined,
    });
    return new ApiResponse(200, data, 'Busha sell initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha sell'));
  }
}

export async function previewBushaBuyController(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = userId(req);
    const { sourceAmount, targetCurrency } = req.body ?? {};
    if (!sourceAmount || !targetCurrency) {
      throw ApiError.badRequest('sourceAmount and targetCurrency are required');
    }
    const { ensureBushaCustomerForUser } = await import('../../services/busha/busha.app.service');
    const customer = await ensureBushaCustomerForUser(uid);
    const data = await previewBushaQuote({
      customerId: customer.id,
      side: 'buy',
      sourceCurrency: 'NGN',
      targetCurrency,
      amount: String(sourceAmount),
      fundingMethod: 'temporary_bank_account',
    });
    return new ApiResponse(200, data, 'Busha buy preview').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to preview Busha buy'));
  }
}

export async function executeBushaBuyController(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceAmount, targetCurrency } = req.body ?? {};
    if (!sourceAmount || !targetCurrency) {
      throw ApiError.badRequest('sourceAmount and targetCurrency are required');
    }
    const data = await executeAppBushaBuy(userId(req), {
      sourceAmount: String(sourceAmount),
      targetCurrency,
    });
    return new ApiResponse(200, data, 'Busha buy initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha buy'));
  }
}

export async function executeBushaReceiveController(req: Request, res: Response, next: NextFunction) {
  try {
    const { currency, amount, network } = req.body ?? {};
    if (!currency || !amount) throw ApiError.badRequest('currency and amount are required');
    const data = await executeAppBushaReceive(userId(req), {
      currency,
      amount: String(amount),
      network: network ? String(network) : undefined,
    });
    return new ApiResponse(200, data, 'Busha receive initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha receive'));
  }
}

export async function previewBushaSendController(req: Request, res: Response, next: NextFunction) {
  try {
    const { currency, amount, destinationNetwork } = req.body ?? {};
    if (!currency || !amount) throw ApiError.badRequest('currency and amount are required');
    const data = await previewAppBushaSend(userId(req), {
      currency,
      amount: String(amount),
      destinationNetwork: destinationNetwork ? String(destinationNetwork) : undefined,
    });
    return new ApiResponse(200, data, 'Busha send preview').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to preview Busha send'));
  }
}

export async function executeBushaSendController(req: Request, res: Response, next: NextFunction) {
  try {
    const { currency, amount, destinationAddress, destinationNetwork, memo } = req.body ?? {};
    if (!currency || !amount || !destinationAddress) {
      throw ApiError.badRequest('currency, amount, and destinationAddress are required');
    }
    const data = await executeAppBushaSend(userId(req), {
      currency,
      amount: String(amount),
      destinationAddress: String(destinationAddress),
      destinationNetwork: destinationNetwork ? String(destinationNetwork) : undefined,
      memo: memo ? String(memo) : undefined,
    });
    return new ApiResponse(200, data, 'Busha send initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha send'));
  }
}

export async function listBushaTradesController(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 30;
    const data = await listAppBushaTrades(userId(req), limit);
    return new ApiResponse(200, data, 'Busha trades fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha trades'));
  }
}

export async function getBushaTradeController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAppBushaTrade(userId(req), req.params.id);
    return new ApiResponse(200, data, 'Busha trade fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha trade'));
  }
}

export async function refreshBushaTradeController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await refreshAppBushaTrade(userId(req), req.params.id);
    return new ApiResponse(200, data, 'Busha trade refreshed').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to refresh Busha trade'));
  }
}
