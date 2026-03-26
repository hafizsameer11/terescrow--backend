import { Request, Response, NextFunction } from 'express';
import { ChangeNowSwapSourceType } from '@prisma/client';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import * as svc from '../../services/changenow/changenow.admin.service';
import * as tickerSvc from '../../services/changenow/changenow.ticker.service';

function adminId(req: Request): number {
  const u = (req as any).user || req.body._user;
  if (!u?.id) throw ApiError.unauthorized('Not authenticated');
  return u.id;
}

export async function getChangeNowCurrenciesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await svc.getCachedCurrencies();
    return new ApiResponse(200, { items: data }, 'ChangeNOW currencies').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to load currencies'));
  }
}

export async function getInternalTickerMapController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const rows = await tickerSvc.listWalletCurrenciesWithTickers();
    return new ApiResponse(200, { items: rows }, 'Internal → ChangeNOW tickers').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to list ticker map'));
  }
}

export async function putTickerMappingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const walletCurrencyId = parseInt(String(req.params.walletCurrencyId), 10);
    const { changenowTicker } = req.body;
    if (!Number.isFinite(walletCurrencyId) || walletCurrencyId < 1) {
      throw ApiError.badRequest('Invalid walletCurrencyId');
    }
    if (!changenowTicker || String(changenowTicker).trim() === '') {
      throw ApiError.badRequest('changenowTicker is required');
    }
    const row = await tickerSvc.upsertTickerMapping(walletCurrencyId, String(changenowTicker));
    return new ApiResponse(200, row, 'Ticker mapping saved').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to save mapping'));
  }
}

export async function getQuoteController(req: Request, res: Response, next: NextFunction) {
  try {
    const fromTicker = String(req.query.fromTicker || '').trim();
    const toTicker = String(req.query.toTicker || '').trim();
    const amount = String(req.query.amount || '').trim();
    if (!fromTicker || !toTicker || !amount) {
      throw ApiError.badRequest('fromTicker, toTicker, and amount are required');
    }
    const q = await svc.getQuote({ fromTicker, toTicker, amount });
    return new ApiResponse(200, q, 'Quote').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Quote failed'));
  }
}

export async function getAvailablePairsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await svc.getAvailablePairs({
      fromCurrency: req.query.fromCurrency ? String(req.query.fromCurrency).trim() : undefined,
      toCurrency: req.query.toCurrency ? String(req.query.toCurrency).trim() : undefined,
      fromNetwork: req.query.fromNetwork ? String(req.query.fromNetwork).trim() : undefined,
      toNetwork: req.query.toNetwork ? String(req.query.toNetwork).trim() : undefined,
      flow: req.query.flow === 'fixed-rate' ? 'fixed-rate' : 'standard',
    });
    return new ApiResponse(200, { items: data }, 'Available pairs').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to load available pairs'));
  }
}

export async function getNetworkFeeController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const fromTicker = String(req.query.fromTicker || '').trim();
    const toTicker = String(req.query.toTicker || '').trim();
    const amount = String(req.query.amount || '').trim();
    if (!fromTicker || !toTicker || !amount) {
      throw ApiError.badRequest('fromTicker, toTicker, amount are required');
    }
    const data = await svc.getNetworkFeeEstimate({
      fromTicker,
      toTicker,
      amount,
      fromNetwork: req.query.fromNetwork ? String(req.query.fromNetwork).trim() : undefined,
      toNetwork: req.query.toNetwork ? String(req.query.toNetwork).trim() : undefined,
      convertedCurrency: req.query.convertedCurrency
        ? String(req.query.convertedCurrency).trim()
        : undefined,
      convertedNetwork: req.query.convertedNetwork
        ? String(req.query.convertedNetwork).trim()
        : undefined,
    });
    return new ApiResponse(200, data, 'Network fee estimate').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to get network fee estimate'));
  }
}

export async function listPartnerExchangesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await svc.getPartnerExchangesList({
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      offset: req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
      sortDirection:
        req.query.sortDirection === 'ASC' || req.query.sortDirection === 'DESC'
          ? (req.query.sortDirection as 'ASC' | 'DESC')
          : undefined,
      sortField:
        req.query.sortField === 'createdAt' || req.query.sortField === 'updatedAt'
          ? (req.query.sortField as 'createdAt' | 'updatedAt')
          : undefined,
      dateField:
        req.query.dateField === 'createdAt' || req.query.dateField === 'updatedAt'
          ? (req.query.dateField as 'createdAt' | 'updatedAt')
          : undefined,
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
      requestId: req.query.requestId ? String(req.query.requestId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      payoutAddress: req.query.payoutAddress ? String(req.query.payoutAddress) : undefined,
      statuses: req.query.statuses ? String(req.query.statuses) : undefined,
    });
    return new ApiResponse(200, data, 'Partner exchanges').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    const msg = e instanceof Error ? e.message : 'Failed to load partner exchanges';
    // Return actionable upstream details to frontend/admin instead of generic 500.
    if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('not available')) {
      return next(ApiError.forbidden(msg));
    }
    next(ApiError.internal(msg));
  }
}

export async function listPayoutAddressesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const items = await svc.listPayoutAddresses(adminId(req));
    return new ApiResponse(200, { items }, 'Payout addresses').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to list payout addresses'));
  }
}

export async function createPayoutAddressController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { label, address, extraId, toNetworkHint, isDefault } = req.body;
    if (!address || String(address).trim() === '') {
      throw ApiError.badRequest('address is required');
    }
    const row = await svc.createPayoutAddress({
      adminUserId: adminId(req),
      label,
      address: String(address),
      extraId,
      toNetworkHint,
      isDefault: !!isDefault,
    });
    return new ApiResponse(201, row, 'Payout address created').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to create payout address'));
  }
}

export async function updatePayoutAddressController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid id');
    const row = await svc.updatePayoutAddress(adminId(req), id, req.body || {});
    return new ApiResponse(200, row, 'Payout address updated').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to update payout address'));
  }
}

export async function deletePayoutAddressController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid id');
    await svc.deletePayoutAddress(adminId(req), id);
    return new ApiResponse(200, undefined, 'Payout address archived').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to archive payout address'));
  }
}

export async function createSwapController(req: Request, res: Response, next: NextFunction) {
  try {
    const b = req.body || {};
    const sourceType = b.sourceType as string;
    if (sourceType !== 'received_asset' && sourceType !== 'master_wallet') {
      throw ApiError.badRequest('sourceType must be received_asset or master_wallet');
    }
    const fromTicker = String(b.fromTicker || '').trim();
    const toTicker = String(b.toTicker || '').trim();
    const amountFrom = String(b.amountFrom || '').trim();
    const payoutAddressId = parseInt(String(b.payoutAddressId), 10);
    if (!fromTicker || !toTicker || !amountFrom || !Number.isFinite(payoutAddressId)) {
      throw ApiError.badRequest('fromTicker, toTicker, amountFrom, payoutAddressId are required');
    }
    const order = await svc.createSwapOrder({
      adminUserId: adminId(req),
      sourceType: sourceType as ChangeNowSwapSourceType,
      receiveTransactionId: b.receiveTransactionId,
      masterWalletBlockchain: b.masterWalletBlockchain,
      walletCurrencyId: b.walletCurrencyId
        ? parseInt(String(b.walletCurrencyId), 10)
        : undefined,
      fromTicker,
      toTicker,
      amountFrom,
      payoutAddressId,
      refundAddress: b.refundAddress,
    });
    return new ApiResponse(201, order, 'ChangeNOW swap created and pay-in broadcast').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Swap failed'));
  }
}

const SWAP_STATUSES = [
  'awaiting_payin',
  'payin_broadcast',
  'exchanging',
  'completed',
  'failed',
  'refunded',
] as const;

export async function listSwapsController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const status = req.query.status as string | undefined;
    let st: (typeof SWAP_STATUSES)[number] | undefined;
    if (status && SWAP_STATUSES.includes(status as any)) {
      st = status as (typeof SWAP_STATUSES)[number];
    }
    const data = await svc.listSwaps({
      adminUserId: adminId(req),
      page,
      limit,
      status: st,
    });
    return new ApiResponse(200, data, 'Swap orders').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to list swaps'));
  }
}

export async function getSwapController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid id');
    const order = await svc.getSwap(adminId(req), id);
    return new ApiResponse(200, order, 'Swap order').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Failed to load swap'));
  }
}

export async function refreshSwapController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid id');
    const order = await svc.refreshSwapOrderStatus(id, adminId(req));
    return new ApiResponse(200, order, 'Status refreshed').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    next(ApiError.internal('Refresh failed'));
  }
}
