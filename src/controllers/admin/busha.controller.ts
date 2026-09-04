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
  prepareBushaSellPalmpayPayout,
  executeBushaBuy,
  executeBushaSell,
  executeBushaCryptoReceive,
  executeBushaCryptoSend,
  getBushaCustomerWallet,
  getBushaCustomerBalance,
  listBushaCustomerTransfers,
  getBushaCustomerTransfer,
  getBushaCustomerQuote,
  listBushaCustomerRecipients,
  listBushaTrades,
  getBushaTrade,
  refreshBushaTrade,
  listBushaCustomerWallets,
  getBushaCustomerWalletOverview,
} from '../../services/admin/busha.admin.service';
import {
  getBushaMarkupRangesAdmin,
  createBushaMarkupRangeAdmin,
  updateBushaMarkupRangeAdmin,
  deleteBushaMarkupRangeAdmin,
} from '../../services/admin/busha.markup.range.service';

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
    const { customerId, side, sourceCurrency, targetCurrency, amount, amountField, fundingMethod, network, payoutToBalance, payoutRecipientId } =
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
      network: network ? String(network) : undefined,
      payoutToBalance: payoutToBalance === true,
      payoutRecipientId: payoutRecipientId ? String(payoutRecipientId) : undefined,
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

export async function prepareBushaSellPalmpayPayoutController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { customerId, sourceCurrency, targetCurrency, sourceAmount, fundingMethod, network } = req.body ?? {};
    if (!customerId || !sourceCurrency || !targetCurrency || !sourceAmount) {
      throw ApiError.badRequest('customerId, sourceCurrency, targetCurrency, and sourceAmount are required');
    }
    const data = await prepareBushaSellPalmpayPayout({
      adminUserId: admin.id,
      customerId,
      sourceCurrency,
      targetCurrency,
      sourceAmount: String(sourceAmount),
      fundingMethod,
      network: network ? String(network) : undefined,
    });
    return new ApiResponse(200, data, 'PalmPay payout account prepared for Busha sell').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to prepare PalmPay payout for Busha sell'));
  }
}

export async function executeBushaSellController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const {
      customerId,
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      fundingMethod,
      network,
      payoutRecipientId,
      palmpayPayoutOrderId,
      palmpayPayoutOrderNo,
    } = req.body ?? {};
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
      network: network ? String(network) : undefined,
      payoutRecipientId: payoutRecipientId ? String(payoutRecipientId) : undefined,
      palmpayPayoutOrderId: palmpayPayoutOrderId ? String(palmpayPayoutOrderId) : undefined,
      palmpayPayoutOrderNo: palmpayPayoutOrderNo ? String(palmpayPayoutOrderNo) : undefined,
    });
    return new ApiResponse(200, data, 'Busha sell initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha sell'));
  }
}

export async function executeBushaCryptoReceiveController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { customerId, currency, amount, network } = req.body ?? {};

    if (!customerId || !currency || !amount) {
      throw ApiError.badRequest('customerId, currency, and amount are required');
    }

    const data = await executeBushaCryptoReceive({
      adminUserId: admin.id,
      customerId,
      currency,
      amount: String(amount),
      network: network ? String(network) : undefined,
    });

    return new ApiResponse(200, data, 'Busha crypto receive transfer initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha crypto receive'));
  }
}

export async function executeBushaCryptoSendController(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).user;
    const { customerId, currency, amount, destinationAddress, destinationNetwork, memo } = req.body ?? {};

    if (!customerId || !currency || !amount || !destinationAddress) {
      throw ApiError.badRequest('customerId, currency, amount, and destinationAddress are required');
    }

    const data = await executeBushaCryptoSend({
      adminUserId: admin.id,
      customerId,
      currency,
      amount: String(amount),
      destinationAddress: String(destinationAddress),
      destinationNetwork: destinationNetwork ? String(destinationNetwork) : undefined,
      memo: memo ? String(memo) : undefined,
    });

    return new ApiResponse(200, data, 'Busha crypto send transfer initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to execute Busha crypto send'));
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

export async function getBushaCustomerWalletController(req: Request, res: Response, next: NextFunction) {
  try {
    const currency = req.query.currency ? String(req.query.currency) : undefined;
    const data = await getBushaCustomerWallet(req.params.id, currency);
    return new ApiResponse(200, data, 'Busha customer wallet fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha customer wallet'));
  }
}

export async function getBushaCustomerBalanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const currency = String(req.params.currency || '').trim();
    if (!currency) throw ApiError.badRequest('currency is required');
    const data = await getBushaCustomerBalance(req.params.id, currency);
    return new ApiResponse(200, data, 'Busha customer balance fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha customer balance'));
  }
}

export async function listBushaCustomerTransfersController(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit, quoteId, sourceCurrency, targetCurrency, status } = req.query;
    const data = await listBushaCustomerTransfers(req.params.id, {
      limit: limit ? parseInt(String(limit), 10) : undefined,
      quoteId: quoteId ? String(quoteId) : undefined,
      sourceCurrency: sourceCurrency ? String(sourceCurrency) : undefined,
      targetCurrency: targetCurrency ? String(targetCurrency) : undefined,
      status: status ? String(status) : undefined,
    });
    return new ApiResponse(200, data, 'Busha customer transfers fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha customer transfers'));
  }
}

export async function getBushaCustomerTransferController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaCustomerTransfer(req.params.id, req.params.transferId);
    return new ApiResponse(200, data, 'Busha transfer fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha transfer'));
  }
}

export async function getBushaCustomerQuoteController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getBushaCustomerQuote(req.params.id, req.params.quoteId);
    return new ApiResponse(200, data, 'Busha quote fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha quote'));
  }
}

export async function listBushaCustomerRecipientsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listBushaCustomerRecipients(req.params.id);
    return new ApiResponse(200, data, 'Busha recipients fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha recipients'));
  }
}

export async function listBushaCustomerWalletsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listBushaCustomerWallets({
      search: req.query.search ? String(req.query.search) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      sort: req.query.sort as any,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return new ApiResponse(200, data, 'Busha customer wallets fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list Busha customer wallets'));
  }
}

export async function getBushaCustomerWalletOverviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const tradeLimit = req.query.tradeLimit ? Number(req.query.tradeLimit) : 25;
    const data = await getBushaCustomerWalletOverview(req.params.id, tradeLimit);
    return new ApiResponse(200, data, 'Busha customer wallet overview fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to fetch Busha customer wallet overview'));
  }
}

export async function listBushaMarkupRangesController(req: Request, res: Response, next: NextFunction) {
  try {
    const side = req.query.side ? String(req.query.side) : undefined;
    const data = await getBushaMarkupRangesAdmin(side);
    return new ApiResponse(200, data, 'Markup ranges fetched').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to list markup ranges'));
  }
}

export async function createBushaMarkupRangeController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createBushaMarkupRangeAdmin(req.body ?? {});
    return new ApiResponse(201, data, 'Markup range created').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to create markup range'));
  }
}

export async function updateBushaMarkupRangeController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid range id');
    const data = await updateBushaMarkupRangeAdmin(id, req.body ?? {});
    return new ApiResponse(200, data, 'Markup range updated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to update markup range'));
  }
}

export async function deleteBushaMarkupRangeController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid range id');
    const data = await deleteBushaMarkupRangeAdmin(id);
    return new ApiResponse(200, data, 'Markup range deleted').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal('Failed to delete markup range'));
  }
}
