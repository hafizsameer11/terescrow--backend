import { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import profitAdminService from '../../services/profit/profit.admin.service';
import profitTrackerService from '../../services/profit/profit.tracker.service';
import profitBackfillService from '../../services/profit/profit.backfill.service';

function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid id');
  return id;
}

export async function getProfitConfigsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitAdminService.listConfigs();
    return res.status(200).json(new ApiResponse(200, data, 'Profit configs retrieved successfully'));
  } catch (error: any) {
    return next(ApiError.internal(error.message || 'Failed to get profit configs'));
  }
}

export async function createProfitConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.body?._user?.id;
    const data = await profitAdminService.createProfitConfig(req.body, adminUserId);
    return res.status(201).json(new ApiResponse(201, data, 'Profit config created successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to create profit config'));
  }
}

export async function updateProfitConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitAdminService.updateProfitConfig(parseId(req), req.body);
    return res.status(200).json(new ApiResponse(200, data, 'Profit config updated successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to update profit config'));
  }
}

export async function createRateConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.body?._user?.id;
    const data = await profitAdminService.createRateConfig(req.body, adminUserId);
    return res.status(201).json(new ApiResponse(201, data, 'Rate config created successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to create rate config'));
  }
}

export async function updateRateConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitAdminService.updateRateConfig(parseId(req), req.body);
    return res.status(200).json(new ApiResponse(200, data, 'Rate config updated successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to update rate config'));
  }
}

export async function createDiscountTierController(req: Request, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.body?._user?.id;
    const data = await profitAdminService.createDiscountTier(req.body, adminUserId);
    return res.status(201).json(new ApiResponse(201, data, 'Discount tier created successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to create discount tier'));
  }
}

export async function updateDiscountTierController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitAdminService.updateDiscountTier(parseId(req), req.body);
    return res.status(200).json(new ApiResponse(200, data, 'Discount tier updated successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to update discount tier'));
  }
}

export async function previewProfitController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitAdminService.preview(req.body);
    return res.status(200).json(new ApiResponse(200, data, 'Profit preview calculated successfully'));
  } catch (error: any) {
    return next(error instanceof ApiError ? error : ApiError.internal(error.message || 'Failed to preview profit'));
  }
}

export async function getProfitLedgerController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitTrackerService.list({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      transactionType: req.query.transactionType as string | undefined,
      asset: req.query.asset as string | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    });
    return res.status(200).json(new ApiResponse(200, data, 'Profit ledger retrieved successfully'));
  } catch (error: any) {
    return next(ApiError.internal(error.message || 'Failed to get profit ledger'));
  }
}

export async function getProfitStatsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await profitTrackerService.stats({
      transactionType: req.query.transactionType as string | undefined,
      asset: req.query.asset as string | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    });
    return res.status(200).json(new ApiResponse(200, data, 'Profit stats retrieved successfully'));
  } catch (error: any) {
    return next(ApiError.internal(error.message || 'Failed to get profit stats'));
  }
}

export async function backfillProfitLedgerController(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;
    const dryRun = req.body?.dryRun === true;
    const [crypto, fiat] = await Promise.all([
      profitBackfillService.backfillCryptoTransactions({ limit, dryRun }),
      profitBackfillService.backfillFiatTransactions({ limit, dryRun }),
    ]);
    return res.status(200).json(new ApiResponse(200, { crypto, fiat }, dryRun ? 'Backfill dry run complete' : 'Backfill complete'));
  } catch (error: any) {
    return next(ApiError.internal(error.message || 'Failed to run backfill'));
  }
}

export async function reconcileProfitLedgerController(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = await profitBackfillService.reconcile({ limit });
    return res.status(200).json(new ApiResponse(200, data, 'Reconciliation complete'));
  } catch (error: any) {
    return next(ApiError.internal(error.message || 'Failed to reconcile profit ledger'));
  }
}
