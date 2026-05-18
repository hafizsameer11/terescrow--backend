import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

const vendorModel = (prisma as any).vendor;

export async function getVendorsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const currency = req.query.currency as string | undefined;
    const where = currency ? { currency } : {};
    const vendors = await vendorModel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { walletCurrency: true },
    });
    return new ApiResponse(200, vendors, 'Vendors retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to fetch vendors'));
  }
}

export async function createVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }
    const { name, network, currency, walletAddress, notes, walletCurrencyId } = req.body;
    const wcid =
      walletCurrencyId != null && walletCurrencyId !== ''
        ? parseInt(String(walletCurrencyId), 10)
        : undefined;
    const vendor = await vendorModel.create({
      data: {
        name,
        network,
        currency,
        walletAddress,
        notes: notes ?? null,
        ...(Number.isFinite(wcid) ? { walletCurrencyId: wcid } : {}),
      },
      include: { walletCurrency: true },
    });
    return new ApiResponse(201, vendor, 'Vendor created').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to create vendor'));
  }
}

export async function updateVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(ApiError.badRequest('Invalid vendor id'));
    const { name, network, currency, walletAddress, notes, walletCurrencyId } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (network !== undefined) data.network = network;
    if (currency !== undefined) data.currency = currency;
    if (walletAddress !== undefined) data.walletAddress = walletAddress;
    if (notes !== undefined) data.notes = notes;
    if (walletCurrencyId !== undefined) {
      const wcid = parseInt(String(walletCurrencyId), 10);
      data.walletCurrencyId = Number.isFinite(wcid) && wcid > 0 ? wcid : null;
    }
    const vendor = await vendorModel.update({
      where: { id },
      data,
      include: { walletCurrency: true },
    });
    return new ApiResponse(200, vendor, 'Vendor updated').send(res);
  } catch (error: any) {
    if (error?.code === 'P2025') return next(ApiError.notFound('Vendor not found'));
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to update vendor'));
  }
}

export async function deleteVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(ApiError.badRequest('Invalid vendor id'));
    await vendorModel.delete({ where: { id } });
    return new ApiResponse(200, null, 'Vendor deleted').send(res);
  } catch (error: any) {
    if (error?.code === 'P2025') return next(ApiError.notFound('Vendor not found'));
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to delete vendor'));
  }
}
