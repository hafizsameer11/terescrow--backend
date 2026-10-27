import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import profitEngineService, { ProfitComputationInput, ProfitComputationResult } from './profit.engine.service';

export type RecordProfitInput = ProfitComputationInput & {
  sourceTransactionType: string;
  sourceTransactionId: string;
  status?: string;
  notes?: string;
  eventKey?: string;
  meta?: Prisma.InputJsonValue;
  /** Skip profit engine and use these values (e.g. precomputed deposit service fee). */
  forcedProfit?: {
    profitType: 'FIXED' | 'PERCENTAGE' | 'SPREAD';
    profitValue: string | number | Decimal;
    profitNgn: string | number | Decimal;
    notes?: string;
  };
  /** When upserting, also update these legacy event keys if present (same economic event). */
  alternateEventKeys?: string[];
};

function buildEventKey(input: RecordProfitInput): string {
  if (input.eventKey?.trim()) return input.eventKey.trim();
  return `${input.sourceTransactionType.toUpperCase().trim()}:${input.sourceTransactionId}:${input.transactionType.toUpperCase().trim()}`;
}

class ProfitLedgerService {
  async record(input: RecordProfitInput) {
    const writesEnabled = process.env.PROFIT_TRACKER_WRITE_ENABLED !== 'false';
    if (!writesEnabled) {
      return null;
    }

    const computed: ProfitComputationResult = input.forcedProfit
      ? {
          transactionType: input.transactionType.toUpperCase().trim(),
          asset: input.asset?.toUpperCase().trim() ?? null,
          blockchain: input.blockchain?.toLowerCase().trim() ?? null,
          service: input.service?.toLowerCase().trim() ?? null,
          amount: new Decimal(input.amount),
          amountUsd: input.amountUsd != null ? new Decimal(input.amountUsd) : null,
          amountNgn: input.amountNgn != null ? new Decimal(input.amountNgn) : null,
          buyRate: input.buyRate != null ? new Decimal(input.buyRate) : null,
          sellRate: input.sellRate != null ? new Decimal(input.sellRate) : null,
          discountPercentage: null,
          profitType: input.forcedProfit.profitType,
          profitValue: new Decimal(input.forcedProfit.profitValue),
          profitNgn: new Decimal(input.forcedProfit.profitNgn),
          notes: input.forcedProfit.notes ?? input.notes ?? 'Precomputed profit.',
        }
      : await profitEngineService.compute(input);
    const eventKey = buildEventKey(input);

    const occurredAt = input.asOf ?? new Date();

    try {
      return await prisma.profitLedger.create({
        data: {
          eventKey,
          sourceTransactionType: input.sourceTransactionType.toUpperCase().trim(),
          sourceTransactionId: input.sourceTransactionId,
          transactionType: computed.transactionType,
          asset: computed.asset || null,
          blockchain: computed.blockchain || null,
          service: computed.service || null,
          sourceOccurredAt: occurredAt,
          amount: computed.amount,
          amountUsd: computed.amountUsd ?? null,
          amountNgn: computed.amountNgn ?? null,
          buyRate: computed.buyRate ?? null,
          sellRate: computed.sellRate ?? null,
          discountPercentage: computed.discountPercentage ?? null,
          profitType: computed.profitType,
          profitValue: computed.profitValue,
          profitNgn: computed.profitNgn,
          status: input.status || 'computed',
          notes: input.notes || computed.notes || null,
          meta: input.meta || {
            configId: computed.configId || null,
            rateConfigId: computed.rateConfigId || null,
            discountTierId: computed.discountTierId || null,
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return prisma.profitLedger.findUnique({ where: { eventKey } });
      }
      throw error;
    }
  }

  /**
   * Create or overwrite a ledger row with forced profit (e.g. bill provider commission).
   * Also zeros/updates alternate legacy event keys for the same source tx when provided.
   */
  async upsertForced(input: RecordProfitInput & { forcedProfit: NonNullable<RecordProfitInput['forcedProfit']> }) {
    const writesEnabled = process.env.PROFIT_TRACKER_WRITE_ENABLED !== 'false';
    if (!writesEnabled) return null;

    const eventKey = buildEventKey(input);
    const occurredAt = input.asOf ?? new Date();
    const profitType = input.forcedProfit.profitType;
    const profitValue = new Decimal(input.forcedProfit.profitValue);
    const profitNgn = new Decimal(input.forcedProfit.profitNgn);
    const notes = input.forcedProfit.notes ?? input.notes ?? 'Precomputed profit.';
    const transactionType = input.transactionType.toUpperCase().trim();
    const asset = input.asset?.toUpperCase().trim() ?? null;
    const blockchain = input.blockchain?.toLowerCase().trim() ?? null;
    const service = input.service?.toLowerCase().trim() ?? null;
    const amount = new Decimal(input.amount);
    const amountUsd = input.amountUsd != null ? new Decimal(input.amountUsd) : null;
    const amountNgn = input.amountNgn != null ? new Decimal(input.amountNgn) : null;

    const data = {
      sourceTransactionType: input.sourceTransactionType.toUpperCase().trim(),
      sourceTransactionId: input.sourceTransactionId,
      transactionType,
      asset,
      blockchain,
      service,
      sourceOccurredAt: occurredAt,
      amount,
      amountUsd,
      amountNgn,
      buyRate: input.buyRate != null ? new Decimal(input.buyRate) : null,
      sellRate: input.sellRate != null ? new Decimal(input.sellRate) : null,
      discountPercentage: null as Decimal | null,
      profitType,
      profitValue,
      profitNgn,
      status: input.status || 'computed',
      notes,
      meta: input.meta || undefined,
    };

    const existing = await prisma.profitLedger.findUnique({ where: { eventKey } });
    let row;
    if (existing) {
      row = await prisma.profitLedger.update({ where: { eventKey }, data });
    } else {
      try {
        row = await prisma.profitLedger.create({ data: { eventKey, ...data } });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          row = await prisma.profitLedger.update({ where: { eventKey }, data });
        } else {
          throw error;
        }
      }
    }

    for (const alt of input.alternateEventKeys || []) {
      if (!alt || alt === eventKey) continue;
      // Drop legacy duplicate keys so admin totals don't double-count the same bill.
      await prisma.profitLedger.deleteMany({ where: { eventKey: alt } });
    }

    return row;
  }
}

export default new ProfitLedgerService();
