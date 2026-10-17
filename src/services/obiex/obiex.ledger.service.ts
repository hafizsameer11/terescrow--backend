import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { Decimal } from '@prisma/client/runtime/library';

const assetModel = () => (prisma as any).obiexUserAsset;

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export async function getOrCreateObiexAsset(userId: number, currency: string) {
  const code = String(currency || '').trim().toUpperCase();
  if (!code) throw ApiError.badRequest('currency required');
  const existing = await assetModel().findUnique({
    where: { userId_currency: { userId, currency: code } },
  });
  if (existing) return existing;
  return assetModel().create({
    data: { userId, currency: code, userAvailable: 0 },
  });
}

export async function getObiexAvailable(userId: number, currency: string): Promise<number> {
  const row = await getOrCreateObiexAsset(userId, currency);
  return toNum(row.userAvailable);
}

export async function listObiexUserAssets(userId: number) {
  return assetModel().findMany({
    where: { userId },
    orderBy: { currency: 'asc' },
  });
}

export async function creditObiexAsset(
  userId: number,
  currency: string,
  amount: number
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('credit amount must be > 0');
  }
  const code = String(currency).toUpperCase();
  await getOrCreateObiexAsset(userId, code);
  return assetModel().update({
    where: { userId_currency: { userId, currency: code } },
    data: { userAvailable: { increment: new Decimal(amount) } },
  });
}

export async function debitObiexAsset(
  userId: number,
  currency: string,
  amount: number
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('debit amount must be > 0');
  }
  const code = String(currency).toUpperCase();
  const row = await getOrCreateObiexAsset(userId, code);
  const available = toNum(row.userAvailable);
  if (available + 1e-12 < amount) {
    throw ApiError.badRequest(`Insufficient ${code} balance`);
  }
  return assetModel().update({
    where: { userId_currency: { userId, currency: code } },
    data: { userAvailable: { decrement: new Decimal(amount) } },
  });
}
