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
}

export default new ProfitLedgerService();
