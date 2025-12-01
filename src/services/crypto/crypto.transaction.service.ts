/**
 * Crypto Transaction Service
 * 
 * Handles crypto transaction operations (Buy, Sell, Send, Receive)
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type CryptoTxType = 'BUY' | 'SELL' | 'SEND' | 'RECEIVE';
export type CryptoTxStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled';

interface CreateCryptoBuyData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira: string | number;
  rate?: string | number;
  txHash?: string;
  status?: CryptoTxStatus;
}

interface CreateCryptoSellData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira: string | number;
  rate?: string | number;
  txHash?: string;
  status?: CryptoTxStatus;
}

interface CreateCryptoSendData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira?: string | number;
  rate?: string | number;
  txHash: string;
  networkFee?: string | number;
  status?: CryptoTxStatus;
}

interface CreateCryptoReceiveData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira?: string | number;
  rate?: string | number;
  txHash: string;
  blockNumber?: bigint | number;
  confirmations?: number;
  status?: CryptoTxStatus;
}

class CryptoTransactionService {
  /**
   * Create a crypto buy transaction
   */
  async createBuyTransaction(data: CreateCryptoBuyData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...buyData } = data;
    
    // Get virtual account to determine currency and blockchain
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        id: transactionId,
        userId,
        virtualAccountId,
        transactionType: 'BUY',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoBuy: {
          create: {
            fromAddress: buyData.fromAddress || null,
            toAddress: buyData.toAddress || null,
            amount: new Decimal(buyData.amount),
            amountUsd: new Decimal(buyData.amountUsd),
            amountNaira: new Decimal(buyData.amountNaira),
            rate: buyData.rate ? new Decimal(buyData.rate) : null,
            txHash: buyData.txHash || null,
          },
        },
      },
      include: {
        cryptoBuy: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto sell transaction
   */
  async createSellTransaction(data: CreateCryptoSellData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...sellData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        id: transactionId,
        userId,
        virtualAccountId,
        transactionType: 'SELL',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoSell: {
          create: {
            fromAddress: sellData.fromAddress || null,
            toAddress: sellData.toAddress || null,
            amount: new Decimal(sellData.amount),
            amountUsd: new Decimal(sellData.amountUsd),
            amountNaira: new Decimal(sellData.amountNaira),
            rate: sellData.rate ? new Decimal(sellData.rate) : null,
            txHash: sellData.txHash || null,
          },
        },
      },
      include: {
        cryptoSell: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto send transaction
   */
  async createSendTransaction(data: CreateCryptoSendData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...sendData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        id: transactionId,
        userId,
        virtualAccountId,
        transactionType: 'SEND',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoSend: {
          create: {
            fromAddress: sendData.fromAddress,
            toAddress: sendData.toAddress,
            amount: new Decimal(sendData.amount),
            amountUsd: new Decimal(sendData.amountUsd),
            amountNaira: sendData.amountNaira ? new Decimal(sendData.amountNaira) : null,
            rate: sendData.rate ? new Decimal(sendData.rate) : null,
            txHash: sendData.txHash,
            networkFee: sendData.networkFee ? new Decimal(sendData.networkFee) : null,
          },
        },
      },
      include: {
        cryptoSend: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto receive transaction
   */
  async createReceiveTransaction(data: CreateCryptoReceiveData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...receiveData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        id: transactionId,
        userId,
        virtualAccountId,
        transactionType: 'RECEIVE',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoReceive: {
          create: {
            fromAddress: receiveData.fromAddress,
            toAddress: receiveData.toAddress,
            amount: new Decimal(receiveData.amount),
            amountUsd: new Decimal(receiveData.amountUsd),
            amountNaira: receiveData.amountNaira ? new Decimal(receiveData.amountNaira) : null,
            rate: receiveData.rate ? new Decimal(receiveData.rate) : null,
            txHash: receiveData.txHash,
            blockNumber: receiveData.blockNumber ? BigInt(receiveData.blockNumber) : null,
            confirmations: receiveData.confirmations || 0,
          },
        },
      },
      include: {
        cryptoReceive: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Get user's crypto transactions
   */
  async getUserTransactions(
    userId: number,
    transactionType?: CryptoTxType,
    limit: number = 50,
    offset: number = 0
  ) {
    const where: any = { userId };
    if (transactionType) {
      where.transactionType = transactionType;
    }

    const [transactions, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where,
        include: {
          cryptoBuy: true,
          cryptoSell: true,
          cryptoSend: true,
          cryptoReceive: true,
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cryptoTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string, userId?: number) {
    const where: any = { transactionId };
    if (userId) {
      where.userId = userId;
    }

    const transaction = await prisma.cryptoTransaction.findUnique({
      where,
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    if (!transaction) {
      return null;
    }

    return this.formatTransaction(transaction);
  }

  /**
   * Get transactions for a specific virtual account
   */
  async getVirtualAccountTransactions(
    userId: number,
    virtualAccountId: number,
    limit: number = 50,
    offset: number = 0
  ) {
    const [transactions, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where: {
          userId,
          virtualAccountId,
        },
        include: {
          cryptoBuy: true,
          cryptoSell: true,
          cryptoSend: true,
          cryptoReceive: true,
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cryptoTransaction.count({
        where: {
          userId,
          virtualAccountId,
        },
      }),
    ]);

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      limit,
      offset,
    };
  }

  /**
   * Format transaction for API response
   */
  private formatTransaction(transaction: any) {
    const base = {
      id: transaction.transactionId,
      transactionType: transaction.transactionType,
      status: transaction.status,
      currency: transaction.currency,
      blockchain: transaction.blockchain,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      tradeType: this.getTradeTypeLabel(transaction.transactionType),
      cryptocurrencyType: transaction.virtualAccount?.walletCurrency?.name || transaction.currency,
    };

    // Add transaction-specific data based on type
    if (transaction.cryptoBuy) {
      return {
        ...base,
        from: transaction.cryptoBuy.fromAddress || 'External',
        to: transaction.cryptoBuy.toAddress || 'Your Crypto wallet',
        amount: `${transaction.cryptoBuy.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoBuy.amountUsd.toString()}`,
        amountNaira: `NGN${transaction.cryptoBuy.amountNaira.toString()}`,
        rate: transaction.cryptoBuy.rate ? `NGN${transaction.cryptoBuy.rate.toString()}/$` : null,
        txHash: transaction.cryptoBuy.txHash,
      };
    }

    if (transaction.cryptoSell) {
      return {
        ...base,
        from: transaction.cryptoSell.fromAddress || 'Your Crypto wallet',
        to: transaction.cryptoSell.toAddress || 'Tercescrow',
        amount: `${transaction.cryptoSell.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoSell.amountUsd.toString()}`,
        youReceived: `NGN${transaction.cryptoSell.amountNaira.toString()}`,
        rate: transaction.cryptoSell.rate ? `NGN${transaction.cryptoSell.rate.toString()}/$` : null,
        txHash: transaction.cryptoSell.txHash,
      };
    }

    if (transaction.cryptoSend) {
      return {
        ...base,
        from: transaction.cryptoSend.fromAddress,
        to: transaction.cryptoSend.toAddress,
        amount: `${transaction.cryptoSend.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoSend.amountUsd.toString()}`,
        amountNaira: transaction.cryptoSend.amountNaira 
          ? `NGN${transaction.cryptoSend.amountNaira.toString()}` 
          : null,
        rate: transaction.cryptoSend.rate ? `NGN${transaction.cryptoSend.rate.toString()}/$` : null,
        txHash: transaction.cryptoSend.txHash,
        networkFee: transaction.cryptoSend.networkFee?.toString(),
      };
    }

    if (transaction.cryptoReceive) {
      return {
        ...base,
        from: transaction.cryptoReceive.fromAddress,
        to: transaction.cryptoReceive.toAddress || 'Your Crypto wallet',
        amount: `${transaction.cryptoReceive.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoReceive.amountUsd.toString()}`,
        amountNaira: transaction.cryptoReceive.amountNaira 
          ? `NGN${transaction.cryptoReceive.amountNaira.toString()}` 
          : null,
        rate: transaction.cryptoReceive.rate ? `NGN${transaction.cryptoReceive.rate.toString()}/$` : null,
        txHash: transaction.cryptoReceive.txHash,
        confirmations: transaction.cryptoReceive.confirmations,
      };
    }

    return base;
  }

  /**
   * Get trade type label for display
   */
  private getTradeTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      BUY: 'Crypto Buy',
      SELL: 'Crypto Sell',
      SEND: 'Crypto Transfer',
      RECEIVE: 'Crypto Deposit',
    };
    return labels[type] || type;
  }
}

export default new CryptoTransactionService();

