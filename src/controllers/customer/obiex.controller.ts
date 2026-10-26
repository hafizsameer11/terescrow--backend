import { NextFunction, Request, Response } from 'express';
import {
  executeAppObiexBuy,
  executeAppObiexSell,
  executeAppObiexSend,
  getAppObiexAssetDetail,
  getAppObiexAssets,
  getAppObiexDepositAddress,
  getAppObiexPublicRates,
  getAppObiexStatus,
  getAppObiexTrade,
  getAppObiexWallet,
  listAppObiexTrades,
  previewAppObiexBuy,
  previewAppObiexSell,
  previewAppObiexSend,
} from '../../services/obiex/obiex.app.service';
import {
  executeAppObiexSwap,
  listAppObiexSwapPairs,
  previewAppObiexSwap,
} from '../../services/obiex/obiex.swap.service';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';

function userId(req: Request): number {
  return Number((req as any).user?.id || (req as any)._user?.id);
}

export const getObiexStatusController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getAppObiexStatus(userId(req));
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexPublicRatesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getAppObiexPublicRates();
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexWalletController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getAppObiexWallet(userId(req));
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexAssetsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const purpose = String(req.query.purpose || '').toLowerCase();
    const receivableOnly =
      purpose === 'receive' ||
      String(req.query.receivableOnly || '') === '1' ||
      String(req.query.receivableOnly || '').toLowerCase() === 'true';
    const data = await getAppObiexAssets(userId(req), { receivableOnly });
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexAssetDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currency = String(req.params.currency || '');
    const data = await getAppObiexAssetDetail(userId(req), currency);
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexDepositAddressController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currency = String(req.query.currency || req.body?.currency || '');
    const network = String(req.query.network || req.body?.network || '');
    const data = await getAppObiexDepositAddress(userId(req), currency, network);
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const previewObiexBuyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await previewAppObiexBuy(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const executeObiexBuyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await executeAppObiexBuy(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const previewObiexSellController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await previewAppObiexSell(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const executeObiexSellController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await executeAppObiexSell(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const listObiexSwapPairsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await listAppObiexSwapPairs();
    return new ApiResponse(200, data, 'Swap pairs').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(e);
  }
};

export const previewObiexSwapController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = req.body || {};
    const sourceCurrency = body.sourceCurrency || body.fromCurrency;
    const targetCurrency = body.targetCurrency || body.toCurrency;
    const sourceAmount = body.sourceAmount || body.fromAmount;
    if (!sourceCurrency || !targetCurrency || sourceAmount == null || sourceAmount === '') {
      throw ApiError.badRequest(
        'sourceCurrency (or fromCurrency), targetCurrency (or toCurrency), and sourceAmount (or fromAmount) are required'
      );
    }
    const data = await previewAppObiexSwap(userId(req), {
      sourceCurrency: String(sourceCurrency),
      targetCurrency: String(targetCurrency),
      sourceAmount: String(sourceAmount),
    });
    return new ApiResponse(200, data, 'Swap preview').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(e);
  }
};

/** @deprecated alias — use previewObiexSwapController */
export const previewObiexConvertController = previewObiexSwapController;

export const executeObiexSwapController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = req.body || {};
    const sourceCurrency = body.sourceCurrency || body.fromCurrency;
    const targetCurrency = body.targetCurrency || body.toCurrency;
    const sourceAmount = body.sourceAmount || body.fromAmount;
    if (!sourceCurrency || !targetCurrency || sourceAmount == null || sourceAmount === '') {
      throw ApiError.badRequest(
        'sourceCurrency (or fromCurrency), targetCurrency (or toCurrency), and sourceAmount (or fromAmount) are required'
      );
    }
    const data = await executeAppObiexSwap(userId(req), {
      sourceCurrency: String(sourceCurrency),
      targetCurrency: String(targetCurrency),
      sourceAmount: String(sourceAmount),
    });
    return new ApiResponse(200, data, 'Swap completed').send(res);
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(e);
  }
};

/** @deprecated alias — use executeObiexSwapController */
export const executeObiexConvertController = executeObiexSwapController;

export const previewObiexSendController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await previewAppObiexSend(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const executeObiexSendController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await executeAppObiexSend(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const listObiexTradesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await listAppObiexTrades(userId(req), Number(req.query.limit) || 50);
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const getObiexTradeController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getAppObiexTrade(userId(req), String(req.params.id));
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};
