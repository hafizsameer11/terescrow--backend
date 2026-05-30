import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';

export type CryptoDepositFeeBreakdown = {
  feePercent: Decimal;
  grossCrypto: Decimal;
  grossUsd: Decimal;
  feeCrypto: Decimal;
  feeUsd: Decimal;
  creditedCrypto: Decimal;
  creditedUsd: Decimal;
  feeNgn: Decimal | null;
};

const CONFIG_ID = 1;

export async function getCryptoDepositFeePercent(): Promise<Decimal> {
  const row = await prisma.cryptoDepositFeeConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row || !row.isActive) return new Decimal(0);
  const pct = new Decimal(row.feePercent.toString());
  if (!pct.isFinite() || pct.lte(0)) return new Decimal(0);
  return Decimal.min(pct, new Decimal(100));
}

export function computeCryptoDepositFee(params: {
  grossCrypto: Decimal;
  grossUsd: Decimal;
  feePercent: Decimal;
  usdToNgnRate?: Decimal | null;
}): CryptoDepositFeeBreakdown {
  const grossCrypto = params.grossCrypto;
  const grossUsd = params.grossUsd;
  const feePercent = params.feePercent.lte(0) ? new Decimal(0) : params.feePercent;

  const feeCrypto = grossCrypto.mul(feePercent).div(100);
  const feeUsd = grossUsd.mul(feePercent).div(100);
  const creditedCrypto = grossCrypto.minus(feeCrypto);
  const creditedUsd = grossUsd.minus(feeUsd);

  let feeNgn: Decimal | null = null;
  if (params.usdToNgnRate && params.usdToNgnRate.gt(0)) {
    feeNgn = feeUsd.mul(params.usdToNgnRate);
  }

  return {
    feePercent,
    grossCrypto,
    grossUsd,
    feeCrypto,
    feeUsd,
    creditedCrypto,
    creditedUsd,
    feeNgn,
  };
}

export async function getCryptoDepositFeeConfig() {
  let row = await prisma.cryptoDepositFeeConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    row = await prisma.cryptoDepositFeeConfig.create({
      data: { id: CONFIG_ID, feePercent: 0, isActive: true },
    });
  }
  return {
    feePercent: Number(row.feePercent.toString()),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateCryptoDepositFeeConfig(input: {
  feePercent: number;
  isActive?: boolean;
  updatedByUserId?: number;
}) {
  const pct = Number(input.feePercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('Fee percent must be between 0 and 100');
  }

  const row = await prisma.cryptoDepositFeeConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      feePercent: pct,
      isActive: input.isActive ?? true,
      updatedByUserId: input.updatedByUserId ?? null,
    },
    update: {
      feePercent: pct,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedByUserId: input.updatedByUserId ?? null,
    },
  });

  return {
    feePercent: Number(row.feePercent.toString()),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}
