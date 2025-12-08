/**
 * Transaction Overview Service
 * 
 * Aggregates all user transactions by type and provides chart data
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoRateService from '../crypto/crypto.rate.service';

export interface TransactionTypeSummary {
  type: string;
  totalUsd: string;
  totalNgn: string;
  percentage: number;
  count: number;
  latestDate: Date | null;
  icon?: string;
}

export interface TransactionOverviewResult {
  chart: {
    totalUsd: string;
    totalNgn: string;
    types: TransactionTypeSummary[];
  };
  history: TransactionTypeSummary[];
}

class TransactionOverviewService {
  /**
   * Get NGN to USD conversion rate
   * Uses crypto_rates table or falls back to default
   */
  private async getNgnToUsdRate(): Promise<Decimal> {
    try {
      // Try to get rate from crypto_rates table (use BUY type, any amount)
      const rate = await cryptoRateService.getRateForAmount('BUY', 100);
      if (rate) {
        // Rate is stored as NGN per $1, so to convert NGN to USD: 1 / rate
        // Example: if rate is 1500 (1500 NGN = 1 USD), then 1 NGN = 1/1500 USD
        return new Decimal('1').div(new Decimal(rate.rate.toString()));
      }
    } catch (error) {
      console.warn('Failed to get rate from crypto_rates, using default');
    }
    // Fallback to default rate (1500 NGN = 1 USD)
    return new Decimal('0.00067'); // 1 NGN = 0.00067 USD
  }

  /**
   * Get transaction overview with chart data and history grouped by type
   */
  async getTransactionOverview(userId: number): Promise<TransactionOverviewResult> {
    // Get conversion rate once
    const ngnToUsdRate = await this.getNgnToUsdRate();
    // Get all transaction types in parallel
    const [giftCardData, cryptoData, billPaymentData, fiatData] = await Promise.all([
      this.getGiftCardTransactions(userId, ngnToUsdRate),
      this.getCryptoTransactions(userId, ngnToUsdRate),
      this.getBillPaymentTransactions(userId, ngnToUsdRate),
      this.getFiatTransactions(userId, ngnToUsdRate),
    ]);

    // Combine all transaction types
    const types: TransactionTypeSummary[] = [
      {
        type: 'Gift Card',
        totalUsd: giftCardData.totalUsd,
        totalNgn: giftCardData.totalNgn,
        percentage: 0, // Will be calculated below
        count: giftCardData.count,
        latestDate: giftCardData.latestDate,
        icon: 'gift-card',
      },
      {
        type: 'Crypto',
        totalUsd: cryptoData.totalUsd,
        totalNgn: cryptoData.totalNgn,
        percentage: 0, // Will be calculated below
        count: cryptoData.count,
        latestDate: cryptoData.latestDate,
        icon: 'crypto',
      },
      {
        type: 'Bill Payments',
        totalUsd: billPaymentData.totalUsd,
        totalNgn: billPaymentData.totalNgn,
        percentage: 0, // Will be calculated below
        count: billPaymentData.count,
        latestDate: billPaymentData.latestDate,
        icon: 'bill-payment',
      },
      {
        type: 'Naira Transactions',
        totalUsd: fiatData.totalUsd,
        totalNgn: fiatData.totalNgn,
        percentage: 0, // Will be calculated below
        count: fiatData.count,
        latestDate: fiatData.latestDate,
        icon: 'naira',
      },
    ];

    // Calculate totals
    const totalUsd = types.reduce(
      (sum, type) => sum.plus(new Decimal(type.totalUsd)),
      new Decimal('0')
    );
    const totalNgn = types.reduce(
      (sum, type) => sum.plus(new Decimal(type.totalNgn)),
      new Decimal('0')
    );

    // Calculate percentages
    types.forEach((type) => {
      if (totalUsd.gt(0)) {
        type.percentage = new Decimal(type.totalUsd).div(totalUsd).mul(100).toNumber();
      } else {
        type.percentage = 0;
      }
    });

    // Sort by percentage (descending) for chart
    const chartTypes = [...types].sort((a, b) => b.percentage - a.percentage);

    return {
      chart: {
        totalUsd: totalUsd.toString(),
        totalNgn: totalNgn.toString(),
        types: chartTypes,
      },
      history: types, // Keep original order for history
    };
  }

  /**
   * Get gift card transactions summary
   */
  private async getGiftCardTransactions(userId: number, ngnToUsdRate: Decimal) {
    const orders = await prisma.giftCardOrder.findMany({
      where: {
        userId,
        status: { in: ['completed', 'successful'] },
      },
      select: {
        totalAmount: true,
        currencyCode: true,
        exchangeRate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalUsd = new Decimal('0');
    let totalNgn = new Decimal('0');
    let latestDate: Date | null = null;

    orders.forEach((order) => {
      const amount = new Decimal(order.totalAmount);
      
      if (order.currencyCode === 'USD') {
        totalUsd = totalUsd.plus(amount);
        totalNgn = totalNgn.plus(amount.div(ngnToUsdRate));
      } else if (order.currencyCode === 'NGN') {
        totalNgn = totalNgn.plus(amount);
        totalUsd = totalUsd.plus(amount.mul(ngnToUsdRate));
      } else {
        // For other currencies, convert using exchange rate if available
        if (order.exchangeRate) {
          const exchangeRate = new Decimal(order.exchangeRate);
          totalUsd = totalUsd.plus(amount.mul(exchangeRate));
          totalNgn = totalNgn.plus(amount.mul(exchangeRate).div(ngnToUsdRate));
        } else {
          // Fallback: assume it's USD equivalent
          totalUsd = totalUsd.plus(amount);
          totalNgn = totalNgn.plus(amount.div(ngnToUsdRate));
        }
      }

      if (!latestDate || order.createdAt > latestDate) {
        latestDate = order.createdAt;
      }
    });

    return {
      totalUsd: totalUsd.toString(),
      totalNgn: totalNgn.toString(),
      count: orders.length,
      latestDate,
    };
  }

  /**
   * Get crypto transactions summary
   */
  private async getCryptoTransactions(userId: number, ngnToUsdRate: Decimal) {
    const transactions = await prisma.cryptoTransaction.findMany({
      where: {
        userId,
        status: 'successful',
      },
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        cryptoSwap: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalUsd = new Decimal('0');
    let latestDate: Date | null = null;

    transactions.forEach((tx) => {
      let amountUsd = new Decimal('0');

      if (tx.cryptoBuy) {
        amountUsd = new Decimal(tx.cryptoBuy.amountUsd);
      } else if (tx.cryptoSell) {
        amountUsd = new Decimal(tx.cryptoSell.amountUsd);
      } else if (tx.cryptoSend) {
        amountUsd = new Decimal(tx.cryptoSend.amountUsd);
      } else if (tx.cryptoReceive) {
        amountUsd = new Decimal(tx.cryptoReceive.amountUsd);
      } else if (tx.cryptoSwap) {
        amountUsd = new Decimal(tx.cryptoSwap.fromAmountUsd);
      }

      totalUsd = totalUsd.plus(amountUsd);

      if (!latestDate || tx.createdAt > latestDate) {
        latestDate = tx.createdAt;
      }
    });

    const totalNgn = totalUsd.div(ngnToUsdRate);

    return {
      totalUsd: totalUsd.toString(),
      totalNgn: totalNgn.toString(),
      count: transactions.length,
      latestDate,
    };
  }

  /**
   * Get bill payment transactions summary
   */
  private async getBillPaymentTransactions(userId: number, ngnToUsdRate: Decimal) {
    const payments = await prisma.billPayment.findMany({
      where: {
        userId,
        status: { in: ['completed', 'successful'] },
      },
      select: {
        amount: true,
        currency: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalUsd = new Decimal('0');
    let totalNgn = new Decimal('0');
    let latestDate: Date | null = null;

    payments.forEach((payment) => {
      const amount = new Decimal(payment.amount);

      if (payment.currency === 'NGN') {
        totalNgn = totalNgn.plus(amount);
        totalUsd = totalUsd.plus(amount.mul(ngnToUsdRate));
      } else if (payment.currency === 'USD') {
        totalUsd = totalUsd.plus(amount);
        totalNgn = totalNgn.plus(amount.div(ngnToUsdRate));
      } else {
        // Default to NGN
        totalNgn = totalNgn.plus(amount);
        totalUsd = totalUsd.plus(amount.mul(ngnToUsdRate));
      }

      if (!latestDate || payment.createdAt > latestDate) {
        latestDate = payment.createdAt;
      }
    });

    return {
      totalUsd: totalUsd.toString(),
      totalNgn: totalNgn.toString(),
      count: payments.length,
      latestDate,
    };
  }

  /**
   * Get fiat (Naira) transactions summary
   */
  private async getFiatTransactions(userId: number, ngnToUsdRate: Decimal) {
    const transactions = await prisma.fiatTransaction.findMany({
      where: {
        userId,
        status: { in: ['completed', 'successful'] },
        type: { in: ['deposit', 'withdrawal', 'transfer'] }, // Only include main transaction types
      },
      select: {
        amount: true,
        currency: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalUsd = new Decimal('0');
    let totalNgn = new Decimal('0');
    let latestDate: Date | null = null;

    transactions.forEach((tx) => {
      const amount = new Decimal(tx.amount);

      if (tx.currency === 'NGN') {
        totalNgn = totalNgn.plus(amount);
        totalUsd = totalUsd.plus(amount.mul(ngnToUsdRate));
      } else if (tx.currency === 'USD') {
        totalUsd = totalUsd.plus(amount);
        totalNgn = totalNgn.plus(amount.div(ngnToUsdRate));
      } else {
        // Default to NGN
        totalNgn = totalNgn.plus(amount);
        totalUsd = totalUsd.plus(amount.mul(ngnToUsdRate));
      }

      if (!latestDate || tx.createdAt > latestDate) {
        latestDate = tx.createdAt;
      }
    });

    return {
      totalUsd: totalUsd.toString(),
      totalNgn: totalNgn.toString(),
      count: transactions.length,
      latestDate,
    };
  }
}

export default new TransactionOverviewService();

