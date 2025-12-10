/**
 * Recent Transactions Service
 * 
 * Fetches recent transactions from all types (Crypto, Bill Payment, Gift Card, Fiat)
 * and combines them into a unified list with type identification
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface RecentTransaction {
  id: string;
  type: 'CRYPTO' | 'BILL_PAYMENT' | 'GIFT_CARD' | 'FIAT';
  transactionType?: string; // For crypto: BUY, SELL, SEND, RECEIVE, SWAP
  status: string;
  amount: string;
  currency: string;
  amountUsd?: string;
  amountNaira?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: any; // Additional transaction-specific data
}

class RecentTransactionsService {
  /**
   * Get recent transactions from all types
   * 
   * @param userId - User ID
   * @param limit - Number of transactions to return (default: 50)
   * @param offset - Pagination offset (default: 0)
   */
  async getRecentTransactions(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: RecentTransaction[]; total: number; limit: number; offset: number }> {
    // Fetch transactions from all types in parallel
    const [cryptoTransactions, billPayments, giftCardOrders, fiatTransactions] = await Promise.all([
      this.getCryptoTransactions(userId),
      this.getBillPayments(userId),
      this.getGiftCardOrders(userId),
      this.getFiatTransactions(userId),
    ]);

    // Combine all transactions
    const allTransactions: RecentTransaction[] = [
      ...cryptoTransactions,
      ...billPayments,
      ...giftCardOrders,
      ...fiatTransactions,
    ];

    // Sort by createdAt (most recent first)
    allTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Get total count
    const total = allTransactions.length;

    // Apply pagination
    const paginatedTransactions = allTransactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get crypto transactions
   */
  private async getCryptoTransactions(userId: number): Promise<RecentTransaction[]> {
    const transactions = await prisma.cryptoTransaction.findMany({
      where: { userId },
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        cryptoSwap: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Get more to ensure we have enough after combining
    });

    return transactions.map((tx) => {
      let amount = '0';
      let amountUsd = '0';
      let amountNaira: string | undefined;
      let description = '';

      if (tx.cryptoBuy) {
        amount = tx.cryptoBuy.amount.toString();
        amountUsd = tx.cryptoBuy.amountUsd.toString();
        amountNaira = tx.cryptoBuy.amountNaira.toString();
        description = `Bought ${amount} ${tx.currency}`;
      } else if (tx.cryptoSell) {
        amount = tx.cryptoSell.amount.toString();
        amountUsd = tx.cryptoSell.amountUsd.toString();
        amountNaira = tx.cryptoSell.amountNaira.toString();
        description = `Sold ${amount} ${tx.currency}`;
      } else if (tx.cryptoSend) {
        amount = tx.cryptoSend.amount.toString();
        amountUsd = tx.cryptoSend.amountUsd.toString();
        amountNaira = tx.cryptoSend.amountNaira?.toString();
        description = `Sent ${amount} ${tx.currency}`;
      } else if (tx.cryptoReceive) {
        amount = tx.cryptoReceive.amount.toString();
        amountUsd = tx.cryptoReceive.amountUsd.toString();
        amountNaira = tx.cryptoReceive.amountNaira?.toString();
        description = `Received ${amount} ${tx.currency}`;
      } else if (tx.cryptoSwap) {
        amount = tx.cryptoSwap.fromAmount.toString();
        amountUsd = tx.cryptoSwap.fromAmountUsd.toString();
        description = `Swapped ${tx.cryptoSwap.fromAmount} ${tx.cryptoSwap.fromCurrency} to ${tx.cryptoSwap.toAmount} ${tx.cryptoSwap.toCurrency}`;
      }

      return {
        id: tx.transactionId,
        type: 'CRYPTO' as const,
        transactionType: tx.transactionType,
        status: tx.status,
        amount,
        currency: tx.currency,
        amountUsd,
        amountNaira,
        description,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        metadata: {
          blockchain: tx.blockchain,
          symbol: tx.virtualAccount?.walletCurrency?.symbol || null,
        },
      };
    });
  }

  /**
   * Get bill payment transactions
   */
  private async getBillPayments(userId: number): Promise<RecentTransaction[]> {
    const payments = await prisma.billPayment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return payments.map((payment) => ({
      id: payment.transactionId,
      type: 'BILL_PAYMENT' as const,
      status: payment.status,
      amount: payment.amount.toString(),
      currency: payment.currency,
      description: `${payment.sceneCode} - ${payment.billerId} (${payment.rechargeAccount})`,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      metadata: {
        sceneCode: payment.sceneCode,
        billerId: payment.billerId,
        rechargeAccount: payment.rechargeAccount,
        orderNo: payment.palmpayOrderNo,
      },
    }));
  }

  /**
   * Get gift card orders
   */
  private async getGiftCardOrders(userId: number): Promise<RecentTransaction[]> {
    const orders = await prisma.giftCardOrder.findMany({
      where: { userId },
      include: {
        // Include product info if needed
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return orders.map((order) => ({
      id: order.id,
      type: 'GIFT_CARD' as const,
      status: order.status,
      amount: order.totalAmount.toString(),
      currency: order.currencyCode,
      description: `Gift Card - ${order.cardType} (Qty: ${order.quantity})`,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      metadata: {
        productId: order.productId,
        quantity: order.quantity,
        cardType: order.cardType,
        countryCode: order.countryCode,
        reloadlyOrderId: order.reloadlyOrderId,
      },
    }));
  }

  /**
   * Get fiat transactions
   */
  private async getFiatTransactions(userId: number): Promise<RecentTransaction[]> {
    const transactions = await prisma.fiatTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return transactions.map((tx) => {
      let description = tx.description || '';
      if (!description) {
        switch (tx.type.toUpperCase()) {
          case 'DEPOSIT':
            description = `Deposit - ${tx.billProvider || 'Wallet'}`;
            break;
          case 'WITHDRAWAL':
            description = `Withdrawal - ${tx.billProvider || 'Wallet'}`;
            break;
          case 'BILL_PAYMENT':
            description = 'Bill Payment';
            break;
          case 'TRANSFER':
            description = 'Transfer';
            break;
          default:
            description = tx.type;
        }
      }

      return {
        id: tx.id,
        type: 'FIAT' as const,
        transactionType: tx.type,
        status: tx.status,
        amount: tx.amount.toString(),
        currency: tx.currency,
        description,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        metadata: {
          provider: tx.billProvider || null,
          reference: tx.billReference || tx.palmpayOrderNo || null,
          fees: tx.fees?.toString(),
        },
      };
    });
  }
}

export default new RecentTransactionsService();

