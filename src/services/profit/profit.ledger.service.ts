import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import profitEngineService, { ProfitComputationInput } from './profit.engine.service';

export type RecordProfitInput = ProfitComputationInput & {
  sourceTransactionType: string;
  sourceTransactionId: string;
  status?: string;
  notes?: string;
  eventKey?: string;
  meta?: Prisma.InputJsonValue;
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

    const computed = await profitEngineService.compute(input);
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
