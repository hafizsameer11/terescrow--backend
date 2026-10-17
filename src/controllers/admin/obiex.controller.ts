import { NextFunction, Request, Response } from 'express';
import {
  deleteObiexMarkupRange,
  getObiexAdminStatus,
  getObiexMarkupRangesAdmin,
  upsertObiexMarkupRange,
  upsertObiexSettings,
} from '../../services/obiex/obiex.admin.service';

export const getObiexAdminStatusController = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getObiexAdminStatus();
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const putObiexSettingsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await upsertObiexSettings(req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const listObiexMarkupRangesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const side = req.query.side === 'buy' || req.query.side === 'sell' ? req.query.side : undefined;
    const data = await getObiexMarkupRangesAdmin(side);
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const upsertObiexMarkupRangeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await upsertObiexMarkupRange(req.body || {});
    res.json({ status: 'success', data });
  } catch (e) {
    next(e);
  }
};

export const deleteObiexMarkupRangeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await deleteObiexMarkupRange(Number(req.params.id));
    res.json({ status: 'success', data: { deleted: true } });
  } catch (e) {
    next(e);
  }
};
