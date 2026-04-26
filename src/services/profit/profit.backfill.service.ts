import { prisma } from '../../utils/prisma';
import profitLedgerService from './profit.ledger.service';

type BackfillOptions = {
  limit?: number;
  dryRun?: boolean;
};

class ProfitBackfillService {
  async backfillCryptoTransactions(options: BackfillOptions = {}) {
    const limit = Math.min(Math.max(options.limit || 500, 1), 5000);
    const rows = await prisma.cryptoTransaction.findMany({
      where: { status: 'successful' },
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

      if (options.dryRun) continue;

      if (tx.transactionType === 'BUY' && tx.cryptoBuy) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'BUY',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoBuy.amount.toString(),
          amountUsd: tx.cryptoBuy.amountUsd.toString(),
          amountNgn: tx.cryptoBuy.amountNaira.toString(),
        });
        created += 1;
      } else if (tx.transactionType === 'SELL' && tx.cryptoSell) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SELL',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoSell.amount.toString(),
          amountUsd: tx.cryptoSell.amountUsd.toString(),
          amountNgn: tx.cryptoSell.amountNaira.toString(),
          buyRate: tx.cryptoSell.rateCryptoToUsd?.toString(),
          sellRate: tx.cryptoSell.rateUsdToNgn?.toString(),
        });
        created += 1;
      } else if (tx.transactionType === 'SEND' && tx.cryptoSend) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SEND',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoSend.amount.toString(),
          amountUsd: tx.cryptoSend.amountUsd.toString(),
          amountNgn: tx.cryptoSend.amountNaira?.toString(),
          service: 'crypto_send',
        });
        created += 1;
      } else if (tx.transactionType === 'RECEIVE' && tx.cryptoReceive) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'RECEIVE',
          asset: tx.currency,
          blockchain: tx.blockchain,
          amount: tx.cryptoReceive.amount.toString(),
          amountUsd: tx.cryptoReceive.amountUsd.toString(),
          amountNgn: tx.cryptoReceive.amountNaira?.toString(),
          service: 'crypto_receive',
        });
        created += 1;
      } else if (tx.transactionType === 'SWAP' && tx.cryptoSwap) {
        await profitLedgerService.record({
          sourceTransactionType: 'CRYPTO_TRANSACTION',
          sourceTransactionId: tx.transactionId,
          transactionType: 'SWAP',
          asset: tx.cryptoSwap.fromCurrency,
          blockchain: tx.cryptoSwap.fromBlockchain,
          amount: tx.cryptoSwap.fromAmount.toString(),
          amountUsd: tx.cryptoSwap.fromAmountUsd.toString(),
          service: 'crypto_swap',
        });
        created += 1;
      }
    }

    return { scanned, created, skipped, dryRun: !!options.dryRun };
  }

  async backfillFiatTransactions(options: BackfillOptions = {}) {
    const limit = Math.min(Math.max(options.limit || 500, 1), 5000);
    const rows = await prisma.fiatTransaction.findMany({
      where: { status: 'completed' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let scanned = 0;
    let created = 0;
    let skipped = 0;
    for (const tx of rows) {
      scanned += 1;
      const type = (tx.type || '').toUpperCase();
      const eventKey = `FIAT_TRANSACTION:${tx.id}:${type === 'WITHDRAW' ? 'WITHDRAWAL' : type}`;
      const existing = await prisma.profitLedger.findUnique({ where: { eventKey } });
      if (existing) {
        skipped += 1;
        continue;
      }
      if (options.dryRun) continue;
      await profitLedgerService.record({
        sourceTransactionType: 'FIAT_TRANSACTION',
        sourceTransactionId: tx.id,
        transactionType: type === 'WITHDRAW' ? 'WITHDRAWAL' : type,
        asset: tx.currency,
        service: type.startsWith('BILL') ? tx.billType || 'bill_payment' : undefined,
        amount: tx.amount.toString(),
        amountNgn: tx.totalAmount.toString(),
      });
      created += 1;
    }
    return { scanned, created, skipped, dryRun: !!options.dryRun };
  }

  async reconcile(options: BackfillOptions = {}) {
    const crypto = await this.backfillCryptoTransactions({ ...options, dryRun: true });
    const fiat = await this.backfillFiatTransactions({ ...options, dryRun: true });
    return {
      missing: {
        crypto: crypto.scanned - crypto.skipped,
        fiat: fiat.scanned - fiat.skipped,
      },
      scanned: {
        crypto: crypto.scanned,
        fiat: fiat.scanned,
      },
    };
  }
}

export default new ProfitBackfillService();
