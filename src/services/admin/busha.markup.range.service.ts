import ApiError from '../../utils/ApiError';
import { prisma } from '../../utils/prisma';
import { listBushaMarkupRanges, parseSignedPercent, type BushaMarkupSide } from '../busha/busha.markup';

const rangeModel = () => (prisma as any).bushaMarkupRange;

function parseUsdBound(value: unknown, field: string): number {
  const n = parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`${field} must be a non-negative number`);
  }
  return Math.round(n * 10000) / 10000;
}

function assertSide(side: unknown): BushaMarkupSide {
  const s = String(side || '').toLowerCase();
  if (s !== 'buy' && s !== 'sell') {
    throw ApiError.badRequest('side must be buy or sell');
  }
  return s;
}

export async function getBushaMarkupRangesAdmin(side?: string) {
  const s = side ? assertSide(side) : undefined;
  const rows = await listBushaMarkupRanges(s);
  return rows.map((r: any) => ({
    id: r.id,
    side: r.side,
    minUsd: Number(r.minUsd),
    maxUsd: Number(r.maxUsd),
    percent: Number(r.percent),
    isActive: !!r.isActive,
    sortOrder: r.sortOrder ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createBushaMarkupRangeAdmin(input: {
  side: string;
  minUsd: number | string;
  maxUsd: number | string;
  percent: number | string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const side = assertSide(input.side);
  const minUsd = parseUsdBound(input.minUsd, 'minUsd');
  const maxUsd = parseUsdBound(input.maxUsd, 'maxUsd');
  if (maxUsd < minUsd) {
    throw ApiError.badRequest('maxUsd must be greater than or equal to minUsd');
  }
  const percent = parseSignedPercent(input.percent);

  const created = await rangeModel().create({
    data: {
      side,
      minUsd,
      maxUsd,
      percent,
      isActive: input.isActive !== false,
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    },
  });

  return {
    id: created.id,
    side: created.side,
    minUsd: Number(created.minUsd),
    maxUsd: Number(created.maxUsd),
    percent: Number(created.percent),
    isActive: !!created.isActive,
    sortOrder: created.sortOrder ?? 0,
  };
}

export async function updateBushaMarkupRangeAdmin(
  id: number,
  input: {
    side?: string;
    minUsd?: number | string;
    maxUsd?: number | string;
    percent?: number | string;
    isActive?: boolean;
    sortOrder?: number;
  }
) {
  const existing = await rangeModel().findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Markup range not found');

  const side = input.side !== undefined ? assertSide(input.side) : existing.side;
  const minUsd =
    input.minUsd !== undefined ? parseUsdBound(input.minUsd, 'minUsd') : Number(existing.minUsd);
  const maxUsd =
    input.maxUsd !== undefined ? parseUsdBound(input.maxUsd, 'maxUsd') : Number(existing.maxUsd);
  if (maxUsd < minUsd) {
    throw ApiError.badRequest('maxUsd must be greater than or equal to minUsd');
  }

  const updated = await rangeModel().update({
    where: { id },
    data: {
      side,
      minUsd,
      maxUsd,
      ...(input.percent !== undefined ? { percent: parseSignedPercent(input.percent) } : {}),
      ...(input.isActive !== undefined ? { isActive: !!input.isActive } : {}),
      ...(input.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))
        ? { sortOrder: Number(input.sortOrder) }
        : {}),
    },
  });

  return {
    id: updated.id,
    side: updated.side,
    minUsd: Number(updated.minUsd),
    maxUsd: Number(updated.maxUsd),
    percent: Number(updated.percent),
    isActive: !!updated.isActive,
    sortOrder: updated.sortOrder ?? 0,
  };
}

export async function deleteBushaMarkupRangeAdmin(id: number) {
  const existing = await rangeModel().findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Markup range not found');
  await rangeModel().delete({ where: { id } });
  return { deleted: true, id };
}
