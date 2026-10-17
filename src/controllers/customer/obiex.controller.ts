import { NextFunction, Request, Response } from 'express';
import {
  executeAppObiexBuy,
  executeAppObiexConvert,
  executeAppObiexSell,
  executeAppObiexSend,
  getAppObiexAssets,
  getAppObiexDepositAddress,
  getAppObiexPublicRates,
  getAppObiexStatus,
  getAppObiexTrade,
  getAppObiexWallet,
  listAppObiexTrades,
  previewAppObiexBuy,
  previewAppObiexConvert,
  previewAppObiexSell,
  previewAppObiexSend,
} from '../../services/obiex/obiex.app.service';

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
    const data = await getAppObiexAssets(userId(req));
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

export const previewObiexConvertController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await previewAppObiexConvert(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const executeObiexConvertController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await executeAppObiexConvert(userId(req), req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

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
