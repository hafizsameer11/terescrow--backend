/**
 * Crypto Rate Service
 *
 * Tiered NGN-per-USD rates by `transactionType`.
 * BUY and SELL use a single base rate plus per-range adjustment %; other types use fixed NGN/$ per tier.
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'SWAP'
  | 'SEND'
  | 'RECEIVE'
  | 'GIFT_CARD_BUY';

/** Types that use base rate + adjustment % per USD range. */
export const PERCENT_ADJUSTMENT_TYPES = ['BUY', 'SELL'] as const;
export type PercentAdjustmentType = (typeof PERCENT_ADJUSTMENT_TYPES)[number];

export function usesPercentAdjustment(transactionType: TransactionType): transactionType is PercentAdjustmentType {
  return (PERCENT_ADJUSTMENT_TYPES as readonly TransactionType[]).includes(transactionType);
}

export function roundNairaRate(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value);
}

export function computeEffectiveRate(baseRate: number, adjustmentPercent: number): number {
  return roundNairaRate(baseRate * (1 + adjustmentPercent / 100));
}

export function parseAdjustmentPercent(value: unknown): number {
  if (value == null || value === '') return 0;
  const s = String(value).trim().replace(/%$/, '');
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error('Invalid adjustment percent');
  }
  return n;
}

export interface CreateCryptoRateInput {
  transactionType: TransactionType;
  minAmount: number;
  maxAmount?: number | null;
  /** Absolute NGN/$ for non BUY/SELL tiers. */
  rate?: number;
  /** +/- % on base rate for BUY/SELL. */
  adjustmentPercent?: number;
}

export interface UpdateCryptoRateInput {
  rate?: number;
  adjustmentPercent?: number;
}

export interface AdminRatesPayload {
  rates: Record<string, Awaited<ReturnType<CryptoRateService['getRatesByType']>>>;
  baseRates: Partial<Record<'BUY' | 'SELL', number | null>>;
}

type TierRow = Awaited<ReturnType<typeof prisma.cryptoRate.findFirst>>;

class CryptoRateService {
  private serializeTier(row: NonNullable<TierRow>) {
    return {
      ...row,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
      rate: row.rate,
      adjustmentPercent: row.adjustmentPercent,
    };
  }

  async getBaseRate(transactionType: TransactionType): Promise<number | null> {
    if (!usesPercentAdjustment(transactionType)) return null;
    const row = await prisma.cryptoRateBase.findUnique({
      where: { transactionType },
    });
    return row ? roundNairaRate(Number(row.baseRate)) : null;
  }

  /** If BUY/SELL tiers exist but no base row yet, seed base from the lowest-USD tier rate. */
  private async bootstrapBaseRateIfMissing(transactionType: TransactionType): Promise<number | null> {
    const existing = await prisma.cryptoRateBase.findUnique({ where: { transactionType } });
    if (existing) return roundNairaRate(Number(existing.baseRate));

    const anchor = await prisma.cryptoRate.findFirst({
      where: { transactionType, isActive: true },
      orderBy: [{ minAmount: 'asc' }, { id: 'asc' }],
    });
    if (!anchor) return null;

    const baseRate = roundNairaRate(Number(anchor.rate));
    await prisma.cryptoRateBase.create({
      data: { transactionType, baseRate },
    });

    if (anchor.adjustmentPercent == null) {
      await prisma.cryptoRate.update({
        where: { id: anchor.id },
        data: { adjustmentPercent: 0 },
      });
    }

    return baseRate;
  }

  async getAllBaseRates(): Promise<Partial<Record<'BUY' | 'SELL', number | null>>> {
    const out: Partial<Record<'BUY' | 'SELL', number | null>> = { BUY: null, SELL: null };
    for (const type of PERCENT_ADJUSTMENT_TYPES) {
      let base = await this.getBaseRate(type);
      if (base == null) {
        base = await this.bootstrapBaseRateIfMissing(type);
      }
      out[type] = base;
    }
    return out;
  }

  async setBaseRate(transactionType: TransactionType, baseRate: number, changedBy?: number) {
    if (!usesPercentAdjustment(transactionType)) {
      throw new Error('Base rate only applies to BUY and SELL');
    }
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      throw new Error('Base rate must be a positive whole number');
    }
    const roundedBase = roundNairaRate(baseRate);

    await prisma.cryptoRateBase.upsert({
      where: { transactionType },
      create: { transactionType, baseRate: roundedBase },
      update: { baseRate: roundedBase },
    });

    const tiers = await prisma.cryptoRate.findMany({
      where: { transactionType, isActive: true },
    });

    for (const tier of tiers) {
      const adj = tier.adjustmentPercent != null ? Number(tier.adjustmentPercent) : 0;
      const effective = computeEffectiveRate(roundedBase, adj);
      await this.updateRate(
        tier.id,
        { rate: effective, adjustmentPercent: adj },
        changedBy,
        { skipAdjustmentCheck: true }
      );
    }

    return { transactionType, baseRate: roundedBase };
  }

  private async resolveEffectiveRate(
    transactionType: TransactionType,
    tier: { rate: Decimal; adjustmentPercent: Decimal | null }
  ): Promise<number> {
    if (!usesPercentAdjustment(transactionType)) {
      return roundNairaRate(Number(tier.rate));
    }
    const base = await this.getBaseRate(transactionType);
    if (base == null) {
      return roundNairaRate(Number(tier.rate));
    }
    const adj = tier.adjustmentPercent != null ? Number(tier.adjustmentPercent) : 0;
    return computeEffectiveRate(base, adj);
  }

  async getRatesByType(transactionType: TransactionType) {
    const rows = await prisma.cryptoRate.findMany({
      where: { transactionType, isActive: true },
      orderBy: [{ minAmount: 'asc' }],
    });

    const base = usesPercentAdjustment(transactionType)
      ? await this.getBaseRate(transactionType)
      : null;

    return rows.map((row) => {
      let adj: number | null =
        row.adjustmentPercent != null ? Number(row.adjustmentPercent) : null;
      if (adj == null && base != null && usesPercentAdjustment(transactionType)) {
        adj = ((Number(row.rate) / base) - 1) * 100;
      }
      const effective = roundNairaRate(
        base != null && adj != null
          ? computeEffectiveRate(base, adj)
          : Number(row.rate)
      );
      return {
        ...row,
        rate: effective,
        adjustmentPercent: row.adjustmentPercent ?? (adj != null ? adj : null),
        effectiveRate: effective,
      };
    });
  }

  async getAllRates(): Promise<AdminRatesPayload> {
    const types: TransactionType[] = ['BUY', 'SELL', 'SWAP', 'SEND', 'RECEIVE', 'GIFT_CARD_BUY'];
    const rates: AdminRatesPayload['rates'] = {};
    for (const type of types) {
      rates[type] = await this.getRatesByType(type);
    }
    const baseRates = await this.getAllBaseRates();
    return { rates, baseRates };
  }

  async getRateForAmount(transactionType: TransactionType, usdAmount: number) {
    const boundedRate = await prisma.cryptoRate.findFirst({
      where: {
        transactionType,
        isActive: true,
        minAmount: { lte: usdAmount },
        maxAmount: { not: null, gte: usdAmount },
      },
      orderBy: [{ maxAmount: 'asc' }, { minAmount: 'desc' }, { id: 'asc' }],
    });

    let tier =
      boundedRate ??
      (await prisma.cryptoRate.findFirst({
        where: {
          transactionType,
          isActive: true,
          minAmount: { lte: usdAmount },
          maxAmount: null,
        },
        orderBy: [{ minAmount: 'desc' }, { id: 'asc' }],
      }));

    if (!tier) return null;

    const effective = await this.resolveEffectiveRate(transactionType, tier);
    return {
      ...tier,
      rate: new Decimal(effective),
    };
  }

  async createRate(data: CreateCryptoRateInput, changedBy?: number) {
    const existing = await prisma.cryptoRate.findFirst({
      where: {
        transactionType: data.transactionType,
        isActive: true,
        OR: [
          {
            AND: [
              { minAmount: { lte: data.minAmount } },
              {
                OR: [{ maxAmount: { gte: data.minAmount } }, { maxAmount: null }],
              },
            ],
          },
          {
            AND: [
              { minAmount: { lte: data.maxAmount || 999999999 } },
              {
                OR: [
                  { maxAmount: { gte: data.maxAmount || 999999999 } },
                  { maxAmount: null },
                ],
              },
            ],
          },
        ],
      },
    });

    if (existing) {
      throw new Error('Rate tier overlaps with existing tier');
    }

    let rate: number;
    let adjustmentPercent: number | null = null;

    if (usesPercentAdjustment(data.transactionType)) {
      const base = await this.getBaseRate(data.transactionType);
      if (base == null) {
        throw new Error('Set the base rate for this transaction type before adding tiers');
      }
      adjustmentPercent =
        data.adjustmentPercent !== undefined
          ? parseAdjustmentPercent(data.adjustmentPercent)
          : 0;
      rate = computeEffectiveRate(base, adjustmentPercent);
    } else {
      if (data.rate == null || !Number.isFinite(data.rate)) {
        throw new Error('rate is required for this transaction type');
      }
      rate = data.rate;
    }
    rate = roundNairaRate(rate);

    const created = await prisma.cryptoRate.create({
      data: {
        transactionType: data.transactionType,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        rate,
        adjustmentPercent: adjustmentPercent != null ? adjustmentPercent : null,
      },
    });

    await prisma.cryptoRateHistory.create({
      data: {
        cryptoRateId: created.id,
        transactionType: created.transactionType,
        minAmount: created.minAmount,
        maxAmount: created.maxAmount,
        oldRate: null,
        newRate: created.rate,
        changedBy: changedBy ?? null,
      },
    });

    return created;
  }

  async updateRate(
    rateId: number,
    data: UpdateCryptoRateInput,
    changedBy?: number,
    opts?: { skipAdjustmentCheck?: boolean }
  ) {
    const existing = await prisma.cryptoRate.findUnique({ where: { id: rateId } });
    if (!existing) {
      throw new Error('Rate not found');
    }

    const txType = existing.transactionType as TransactionType;
    let newRate = data.rate;
    let newAdj =
      data.adjustmentPercent !== undefined
        ? parseAdjustmentPercent(data.adjustmentPercent)
        : existing.adjustmentPercent != null
          ? Number(existing.adjustmentPercent)
          : null;

    if (usesPercentAdjustment(txType) && !opts?.skipAdjustmentCheck) {
      const base = await this.getBaseRate(txType);
      if (base == null) {
        throw new Error('Set the base rate for this transaction type first');
      }
      if (data.adjustmentPercent !== undefined) {
        newAdj = parseAdjustmentPercent(data.adjustmentPercent);
      } else if (data.rate !== undefined) {
        throw new Error('Update adjustmentPercent or base rate; tier rate is derived for BUY/SELL');
      }
      if (newAdj == null) newAdj = 0;
      newRate = computeEffectiveRate(base, newAdj);
    } else if (newRate === undefined) {
      newRate = Number(existing.rate);
    }
    newRate = roundNairaRate(newRate);

    const updated = await prisma.cryptoRate.update({
      where: { id: rateId },
      data: {
        rate: newRate,
        ...(data.adjustmentPercent !== undefined || usesPercentAdjustment(txType)
          ? { adjustmentPercent: newAdj ?? 0 }
          : {}),
      },
    });

    await prisma.cryptoRateHistory.create({
      data: {
        cryptoRateId: updated.id,
        transactionType: updated.transactionType,
        minAmount: updated.minAmount,
        maxAmount: updated.maxAmount,
        oldRate: existing.rate,
        newRate: updated.rate,
        changedBy: changedBy ?? null,
      },
    });

    return updated;
  }

  async deleteRate(rateId: number) {
    return prisma.cryptoRate.update({
      where: { id: rateId },
      data: { isActive: false },
    });
  }

  async getRateHistory(rateId?: number, transactionType?: TransactionType) {
    const where: { cryptoRateId?: number; transactionType?: TransactionType } = {};
    if (rateId) where.cryptoRateId = rateId;
    if (transactionType) where.transactionType = transactionType;

    return prisma.cryptoRateHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }).then((rows) =>
      rows.map((row) => ({
        ...row,
        oldRate: row.oldRate != null ? roundNairaRate(Number(row.oldRate)) : null,
        newRate: roundNairaRate(Number(row.newRate)),
      }))
    );
  }
}

export default new CryptoRateService();
