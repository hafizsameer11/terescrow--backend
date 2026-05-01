import { CryptoTxStatus, CryptoTxType, Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import profitLedgerService from './profit.ledger.service';

export type LedgerSyncDryOptions = {
  limit?: number;
  dryRun?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_YEAR_MS = 730 * DAY_MS;

/** Default window used when callers omit startDate/endDate: max(2yr lookback, earliest active ProfitConfig.effectiveFrom). */
export async function deriveProfitLedgerSyncWindow(input: {
  startDate?: string;
  endDate?: string;
}): Promise<{ start: Date; end: Date }> {
  const end = input.endDate ? new Date(input.endDate) : new Date();

  if (input.startDate) {
    return { start: new Date(input.startDate), end };
  }

  let startMs = end.getTime() - TWO_YEAR_MS;
  const configs = await prisma.profitConfig.findMany({
    where: { isActive: true },
    select: { effectiveFrom: true },
  });
  if (configs.length > 0) {
    const minFrom = Math.min(...configs.map((c) => new Date(c.effectiveFrom).getTime()));
    startMs = Math.max(startMs, Math.min(minFrom, end.getTime()));
  }

  let start = new Date(Math.min(startMs, end.getTime()));
  if (start.getTime() >= end.getTime()) {
    start = new Date(end.getTime() - DAY_MS);
  }
  return { start, end };
}

type SyncCryptoFilters = LedgerSyncDryOptions & {
  transactionType?: string;
  start: Date;
  end: Date;
};

class ProfitBackfillService {
  /** Ensure ledger reflects successful crypto txs in the window; uses configs effective at `tx.createdAt`. */
  async syncCryptoLedgerGap(filters: SyncCryptoFilters) {
    if (process.env.PROFIT_TRACKER_WRITE_ENABLED === 'false' && !filters.dryRun) {
      return { scanned: 0, created: 0, skipped: 0, dryRun: !!filters.dryRun };
    }

    const limit = Math.min(Math.max(filters.limit ?? 3500, 1), 25_000);
    const tt = filters.transactionType?.toUpperCase().trim();
    const isKnownCryptoType = tt
      ? ['BUY', 'SELL', 'SEND', 'RECEIVE', 'SWAP'].includes(tt)
      : false;

    const where: Prisma.CryptoTransactionWhereInput = {
      status: CryptoTxStatus.successful,
      createdAt: { gte: filters.start, lte: filters.end },
      ...(isKnownCryptoType ? { transactionType: tt as CryptoTxType } : {}),
    };

    const rows = await prisma.cryptoTransaction.findMany({
      where,
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        cryptoSwap: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let scanned = 0;
    let created = 0;
    let skipped = 0;

    for (const tx of rows) {
      scanned += 1;
      const eventKey = `CRYPTO_TRANSACTION:${tx.transactionId}:${tx.transactionType}`;
      const existing = await prisma.profitLedger.findUnique({ where: { eventKey } });
      if (existing) {
        skipped += 1;
        continue;
      }

      const eligible =
        (tx.transactionType === CryptoTxType.BUY && !!tx.cryptoBuy) ||
        (tx.transactionType === CryptoTxType.SELL && !!tx.cryptoSell) ||
        (tx.transactionType === CryptoTxType.SEND && !!tx.cryptoSend) ||
        (tx.transactionType === CryptoTxType.RECEIVE && !!tx.cryptoReceive) ||
        (tx.transactionType === CryptoTxType.SWAP && !!tx.cryptoSwap);

      if (filters.dryRun) {
        if (eligible) created += 1;
        continue;
      }

      if (!eligible) continue;

      const asOf = tx.createdAt;
      let inserted = false;

      if (tx.transactionType === CryptoTxType.BUY && tx.cryptoBuy) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'BUY',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoBuy.amount.toString(),
          amountUsd: tx.cryptoBuy.amountUsd.toString(),
          amountNgn: tx.cryptoBuy.amountNaira?.toString() ?? undefined,
          buyRate: tx.cryptoBuy.rateUsdToCrypto?.toString(),
          sellRate: tx.cryptoBuy.rateNgnToUsd?.toString(),
          asOf,
          meta: { source: 'profit.backfill.service', cryptoId: tx.id },
        });
        inserted = true;
      } else if (tx.transactionType === CryptoTxType.SELL && tx.cryptoSell) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SELL',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoSell.amount.toString(),
          amountUsd: tx.cryptoSell.amountUsd.toString(),
          amountNgn: tx.cryptoSell.amountNaira?.toString() ?? undefined,
          buyRate: tx.cryptoSell.rateCryptoToUsd?.toString(),
          sellRate: tx.cryptoSell.rateUsdToNgn?.toString(),
          asOf,
          meta: { source: 'profit.backfill.service', cryptoId: tx.id },
        });
        inserted = true;
      } else if (tx.transactionType === CryptoTxType.SEND && tx.cryptoSend) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SEND',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoSend.amount.toString(),
          amountUsd: tx.cryptoSend.amountUsd.toString(),
          amountNgn: tx.cryptoSend.amountNaira?.toString() ?? undefined,
          service: 'crypto_send',
          asOf,
          meta: { source: 'profit.backfill.service', cryptoId: tx.id },
        });
        inserted = true;
      } else if (tx.transactionType === CryptoTxType.RECEIVE && tx.cryptoReceive) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'RECEIVE',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoReceive.amount.toString(),
          amountUsd: tx.cryptoReceive.amountUsd.toString(),
          amountNgn: tx.cryptoReceive.amountNaira?.toString() ?? undefined,
          service: 'crypto_receive',
          asOf,
          meta: { source: 'profit.backfill.service', cryptoId: tx.id },
        });
        inserted = true;
      } else if (tx.transactionType === CryptoTxType.SWAP && tx.cryptoSwap) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SWAP',
          asset: tx.cryptoSwap.fromCurrency,
          blockchain: tx.cryptoSwap.fromBlockchain,
          amount: tx.cryptoSwap.fromAmount.toString(),
          amountUsd: tx.cryptoSwap.fromAmountUsd.toString(),
          service: 'crypto_swap',
          asOf,
          meta: {
            source: 'profit.backfill.service',
            cryptoId: tx.id,
            toCurrency: tx.cryptoSwap.toCurrency,
            toBlockchain: tx.cryptoSwap.toBlockchain,
            toAmount: tx.cryptoSwap.toAmount?.toString(),
            toAmountUsd: tx.cryptoSwap.toAmountUsd?.toString(),
          },
        });
        inserted = true;
      }

      if (inserted) created += 1;
    }

    return { scanned, created, skipped, dryRun: !!filters.dryRun };
  }

  async syncFiatLedgerGap(
    filters: LedgerSyncDryOptions & { start: Date; end: Date }
  ): Promise<{ scanned: number; created: number; skipped: number; dryRun: boolean }> {
    if (process.env.PROFIT_TRACKER_WRITE_ENABLED === 'false' && !filters.dryRun) {
      return { scanned: 0, created: 0, skipped: 0, dryRun: !!filters.dryRun };
    }

    const limit = Math.min(Math.max(filters.limit ?? 1500, 1), 15_000);
    const rows = await prisma.fiatTransaction.findMany({
      where: {
        status: 'completed',
        createdAt: { gte: filters.start, lte: filters.end },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let scanned = 0;
    let created = 0;
    let skipped = 0;

    for (const tx of rows) {
      scanned += 1;
      const type = (tx.type || '').toUpperCase();
      const ledgerType = type === 'WITHDRAW' ? 'WITHDRAWAL' : type;
      const eventKey = `FIAT_TRANSACTION:${tx.id}:${ledgerType}`;
      const existing = await prisma.profitLedger.findUnique({ where: { eventKey } });
      if (existing) {
        skipped += 1;
        continue;
      }
      if (filters.dryRun) {
        created += 1;
        continue;
      }

      const asOf = tx.completedAt ?? tx.createdAt;
      await profitLedgerService.record({
        sourceTransactionType: 'FIAT_TRANSACTION',
        sourceTransactionId: tx.id,
        transactionType: ledgerType,
        asset: tx.currency,
        service: type.startsWith('BILL') ? tx.billType?.toLowerCase() || 'bill_payment' : undefined,
        amount: tx.amount.toString(),
        amountNgn: tx.totalAmount?.toString() ?? tx.amount.toString(),
        asOf,
        meta: { source: 'profit.backfill.service' },
      });
      created += 1;
    }

    return { scanned, created, skipped, dryRun: !!filters.dryRun };
  }

  /** Full crypto + fiat backfill for optional date bounds (otherwise derived window). */
  async runSyncedBackfill(input: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    dryRun?: boolean;
  }) {
    const { start, end } = await deriveProfitLedgerSyncWindow({
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const max = Math.min(Math.max(Number(input.limit ?? 4500) || 4500, 1), 25_000);
    const fiatCap = Math.max(1, Math.floor(max / 2));

    const [crypto, fiat] = await Promise.all([
      this.syncCryptoLedgerGap({ start, end, limit: max, dryRun: !!input.dryRun }),
      this.syncFiatLedgerGap({
        start,
        end,
        limit: fiatCap,
        dryRun: !!input.dryRun,
      }),
    ]);

    return { crypto, fiat, window: { start, end } };
  }

  /** Ledger list/stats hook: hydrate missing rows for explorer filters before reading `profit_ledger`. */
  async ensureLedgerSyncedForExplorerFilters(filters: {
    transactionType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<void> {
    if (process.env.PROFIT_TRACKER_WRITE_ENABLED === 'false') return;
    if (process.env.PROFIT_TRACKER_LEDGER_SYNC_ON_READ === 'false') return;

    const maxRaw = Number(process.env.PROFIT_TRACKER_LEDGER_SYNC_MAX ?? 4500);
    const maxCaps = Number.isFinite(maxRaw) ? Math.min(Math.max(maxRaw, 1), 25_000) : 4500;

    const { start, end } = await deriveProfitLedgerSyncWindow({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    await Promise.all([
      this.syncCryptoLedgerGap({
        transactionType: filters.transactionType,
        start,
        end,
        limit: maxCaps,
        dryRun: false,
      }),
      this.syncFiatLedgerGap({ start, end, limit: Math.floor(maxCaps / 2), dryRun: false }),
    ]);
  }

  async backfillCryptoTransactions(options: LedgerSyncDryOptions = {}) {
    const { start, end } = await deriveProfitLedgerSyncWindow({});
    return this.syncCryptoLedgerGap({
      start,
      end,
      limit: options.limit,
      dryRun: !!options.dryRun,
    });
  }

  async backfillFiatTransactions(options: LedgerSyncDryOptions = {}) {
    const { start, end } = await deriveProfitLedgerSyncWindow({});
    return this.syncFiatLedgerGap({ start, end, limit: options.limit, dryRun: !!options.dryRun });
  }

  async reconcile(options: LedgerSyncDryOptions = {}) {
    const window = await deriveProfitLedgerSyncWindow({});
    const [crypto, fiat] = await Promise.all([
      this.syncCryptoLedgerGap({
        start: window.start,
        end: window.end,
        limit: options.limit ?? 4500,
        dryRun: true,
      }),
      this.syncFiatLedgerGap({
        start: window.start,
        end: window.end,
        limit: Math.floor((options.limit ?? 4500) / 2),
        dryRun: true,
      }),
    ]);
    const missingCrypto = crypto.created;
    const missingFiat = fiat.created;
    return {
      missing: {
        crypto: missingCrypto,
        fiat: missingFiat,
      },
      scanned: {
        crypto: crypto.scanned,
        fiat: fiat.scanned,
      },
      skippedExisting: {
        crypto: crypto.skipped,
        fiat: fiat.skipped,
      },
    };
  }
}

export default new ProfitBackfillService();
