/**
 * Recent Transactions Service
 *
 * Fetches recent transactions from all types (Crypto, Bill Payment, Gift Card, Fiat)
 * and combines them into a unified list with type identification
 */

import { prisma } from '../../utils/prisma';

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

const bushaTradeLogModel = (prisma as any).bushaTradeLog;

function mapBushaSideToTxType(side: string): string {
  const s = String(side || '').toLowerCase();
  if (s === 'buy') return 'BUY';
  if (s === 'sell') return 'SELL';
  if (s === 'cryptorecv' || s === 'receive') return 'RECEIVE';
  if (s === 'cryptosend' || s === 'send') return 'SEND';
  if (s === 'convert' || s === 'swap') return 'SWAP';
  return s.toUpperCase();
}

function isCryptoLinkedFiatType(type: string): boolean {
  return String(type || '').toUpperCase().startsWith('CRYPTO_');
}

class RecentTransactionsService {
  /**
   * Get recent transactions from all types
   */
  async getRecentTransactions(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: RecentTransaction[]; total: number; limit: number; offset: number }> {
    const [cryptoTransactions, bushaTrades, billPayments, giftCardOrders, fiatTransactions] =
      await Promise.all([
        this.getCryptoTransactions(userId),
        this.getBushaTrades(userId),
        this.getBillPayments(userId),
        this.getGiftCardOrders(userId),
        this.getFiatTransactions(userId),
      ]);

    const allTransactions: RecentTransaction[] = [
      ...cryptoTransactions,
      ...bushaTrades,
      ...billPayments,
      ...giftCardOrders,
      ...fiatTransactions,
    ];

    allTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = allTransactions.length;
    const paginatedTransactions = allTransactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions,
      total,
      limit,
      offset,
    };
  }

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
      take: 100,
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
   * Busha trades — primary crypto history when Busha is active.
   */
  private async getBushaTrades(userId: number): Promise<RecentTransaction[]> {
    if (!bushaTradeLogModel) return [];

    const trades = await bushaTradeLogModel.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return trades.map((t: any) => {
      const side = String(t.side || '').toLowerCase();
      const txType = mapBushaSideToTxType(t.side);
      const source = String(t.sourceCurrency || '').toUpperCase();
      const target = String(t.targetCurrency || '').toUpperCase();
      const sourceAmount = String(t.sourceAmount || '0');
      const targetAmount = t.targetAmount != null ? String(t.targetAmount) : undefined;

      let currency = source;
      let amount = sourceAmount;
      let amountUsd: string | undefined;
      let amountNaira: string | undefined;
      let description = `${txType} ${sourceAmount} ${source}`;

      if (side === 'buy') {
        currency = target || source;
        amount = targetAmount || sourceAmount;
        amountNaira = source === 'NGN' ? sourceAmount : undefined;
        amountUsd = targetAmount;
        description = `Bought ${targetAmount || '?'} ${target} for ₦${sourceAmount}`;
      } else if (side === 'sell') {
        currency = source;
        amount = sourceAmount;
        amountNaira = target === 'NGN' ? targetAmount : undefined;
        amountUsd = sourceAmount;
        description = `Sold ${sourceAmount} ${source} for ₦${targetAmount || '?'}`;
      } else if (side === 'convert' || side === 'swap') {
        currency = source;
        amount = sourceAmount;
        description = `Swapped ${sourceAmount} ${source} to ${targetAmount || '?'} ${target}`;
      } else if (side === 'cryptosend' || side === 'send') {
        description = `Sent ${sourceAmount} ${source}`;
      } else if (side === 'cryptorecv' || side === 'receive') {
        description = `Received ${sourceAmount} ${source}`;
      }

      return {
        id: t.id,
        type: 'CRYPTO' as const,
        transactionType: txType,
        status: t.status,
        amount,
        currency,
        amountUsd,
        amountNaira,
        description,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        metadata: {
          source: 'busha',
          side: t.side,
          sourceCurrency: source,
          targetCurrency: target,
          sourceAmount,
          targetAmount,
          fiatTransactionId: t.fiatTransactionId || null,
          bushaTransferId: t.bushaTransferId || null,
        },
      };
    });
  }

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
      description: `${payment.sceneCode} - ${payment.billerName || payment.billerId} (${payment.rechargeAccount})`,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      metadata: {
        billPaymentId: payment.id,
        walletId: payment.walletId,
        transactionId: payment.transactionId,
        provider: payment.provider,
        sceneCode: payment.sceneCode,
        billType: payment.billType,
        billerId: payment.billerId,
        billerName: payment.billerName,
        itemId: payment.itemId,
        itemName: payment.itemName,
        rechargeAccount: payment.rechargeAccount,
        palmpayOrderId: payment.palmpayOrderId,
        palmpayOrderNo: payment.palmpayOrderNo,
        palmpayStatus: payment.palmpayStatus,
        billReference: payment.billReference,
        errorMessage: payment.errorMessage,
        refunded: payment.refunded,
        refundedAt: payment.refundedAt,
        refundReason: payment.refundReason,
        providerResponse: payment.providerResponse,
        completedAt: payment.completedAt,
      },
    }));
  }

  private async getGiftCardOrders(userId: number): Promise<RecentTransaction[]> {
    const orders = await prisma.giftCardOrder.findMany({
      where: { userId },
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
   * Wallet fiat only. CRYPTO_* rows are NGN legs of crypto trades — excluded so they
   * appear under CRYPTO via BushaTradeLog / CryptoTransaction instead of Naira.
   */
  private async getFiatTransactions(userId: number): Promise<RecentTransaction[]> {
    const transactions = await prisma.fiatTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return transactions
      .filter((tx) => !isCryptoLinkedFiatType(tx.type))
      .map((tx) => {
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
