import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import profitBackfillService from './profit.backfill.service';

type ListFilters = {
  page?: number;
  limit?: number;
  transactionType?: string;
  asset?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  /** Populate missing ProfitLedger rows from source transactions before read (default true). */
  syncHistorical?: boolean;
};

class ProfitTrackerService {
  private mergeAnd(parts: Prisma.ProfitLedgerWhereInput[]): Prisma.ProfitLedgerWhereInput {
    const nonEmpty = parts.filter((p) => p && Object.keys(p).length > 0);
    if (!nonEmpty.length) return {};
    if (nonEmpty.length === 1) return nonEmpty[0];
    return { AND: nonEmpty };
  }

  /**
   * Date filters align with underlying user activity via `sourceOccurredAt`; legacy rows
   * fall back to `createdAt`.
   */
  private dateOccurredOrLegacy(range: Prisma.DateTimeFilter): Prisma.ProfitLedgerWhereInput {
    return {
      OR: [
        { sourceOccurredAt: range },
        {
          AND: [{ sourceOccurredAt: null }, { createdAt: range }],
        },
      ],
    };
  }

  /** Period buckets (today / week / month) use the same semantics as explorer date filters. */
  private occurredAtSince(since: Date): Prisma.ProfitLedgerWhereInput {
    return this.dateOccurredOrLegacy({ gte: since });
  }

  private buildExplorerClauses(filters: Omit<ListFilters, 'page' | 'limit' | 'syncHistorical'>): Prisma.ProfitLedgerWhereInput[] {
    const clauses: Prisma.ProfitLedgerWhereInput[] = [];
    if (filters.transactionType) {
      clauses.push({ transactionType: String(filters.transactionType).toUpperCase().trim() });
    }
    if (filters.asset) {
      clauses.push({ asset: String(filters.asset).toUpperCase().trim() });
    }
    if (filters.status) {
      clauses.push({ status: String(filters.status).toLowerCase().trim() });
    }
    if (filters.startDate || filters.endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (filters.startDate) range.gte = new Date(filters.startDate);
      if (filters.endDate) range.lte = new Date(filters.endDate);
      clauses.push(this.dateOccurredOrLegacy(range));
    }
    return clauses;
  }

  async list(filters: ListFilters) {
    if (filters.syncHistorical !== false) {
      await profitBackfillService.ensureLedgerSyncedForExplorerFilters({
        transactionType: filters.transactionType,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    const page = Math.max(Number(filters.page || 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
    const skip = (page - 1) * limit;
    const where = this.mergeAnd(this.buildExplorerClauses(filters));

    const [items, total] = await Promise.all([
      prisma.profitLedger.findMany({
        where,
        orderBy: [{ sourceOccurredAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.profitLedger.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async stats(filters: Omit<ListFilters, 'page' | 'limit'>) {
    if (filters.syncHistorical !== false) {
      await profitBackfillService.ensureLedgerSyncedForExplorerFilters({
        transactionType: filters.transactionType,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    const explorer = this.mergeAnd(this.buildExplorerClauses(filters));

    const [sumRows, byTypeRows, byAssetRows] = await Promise.all([
      prisma.profitLedger.aggregate({
        where: explorer,
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.groupBy({
        by: ['transactionType'],
        where: explorer,
        _sum: { profitNgn: true },
        _count: { id: true },
      }),
      prisma.profitLedger.groupBy({
        by: ['asset'],
        where: explorer,
        _sum: { profitNgn: true },
        _count: { id: true },
      }),
    ]);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month] = await Promise.all([
      prisma.profitLedger.aggregate({
        where: this.mergeAnd([explorer, this.occurredAtSince(todayStart)]),
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.aggregate({
        where: this.mergeAnd([explorer, this.occurredAtSince(weekStart)]),
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.aggregate({
        where: this.mergeAnd([explorer, this.occurredAtSince(monthStart)]),
        _sum: { profitNgn: true },
      }),
    ]);

    return {
      totalProfit: (sumRows._sum.profitNgn || new Decimal(0)).toString(),
      profitToday: (today._sum.profitNgn || new Decimal(0)).toString(),
      profitThisWeek: (week._sum.profitNgn || new Decimal(0)).toString(),
      profitThisMonth: (month._sum.profitNgn || new Decimal(0)).toString(),
      byTransactionType: byTypeRows.map((r) => ({
        transactionType: r.transactionType,
        totalProfit: (r._sum.profitNgn || new Decimal(0)).toString(),
        count: r._count.id,
      })),
      byAsset: byAssetRows.map((r) => ({
        asset: r.asset || 'UNKNOWN',
        totalProfit: (r._sum.profitNgn || new Decimal(0)).toString(),
        count: r._count.id,
      })),
    };
  }
}

export default new ProfitTrackerService();
