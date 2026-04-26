import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';

type ListFilters = {
  page?: number;
  limit?: number;
  transactionType?: string;
  asset?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
};

class ProfitTrackerService {
  private buildWhere(filters: ListFilters): any {
    const where: any = {};
    if (filters.transactionType) where.transactionType = String(filters.transactionType).toUpperCase().trim();
    if (filters.asset) where.asset = String(filters.asset).toUpperCase().trim();
    if (filters.status) where.status = String(filters.status).toLowerCase().trim();
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }
    return where;
  }

  async list(filters: ListFilters) {
    const page = Math.max(Number(filters.page || 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
    const skip = (page - 1) * limit;
    const where = this.buildWhere(filters);

    const [items, total] = await Promise.all([
      prisma.profitLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
    const where = this.buildWhere(filters);
    const [sumRows, byTypeRows, byAssetRows] = await Promise.all([
      prisma.profitLedger.aggregate({
        where,
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.groupBy({
        by: ['transactionType'],
        where,
        _sum: { profitNgn: true },
        _count: { id: true },
      }),
      prisma.profitLedger.groupBy({
        by: ['asset'],
        where,
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
        where: { ...where, createdAt: { gte: todayStart } },
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.aggregate({
        where: { ...where, createdAt: { gte: weekStart } },
        _sum: { profitNgn: true },
      }),
      prisma.profitLedger.aggregate({
        where: { ...where, createdAt: { gte: monthStart } },
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
