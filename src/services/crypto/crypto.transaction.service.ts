/**
 * Crypto Transaction Service
 * 
 * Handles crypto transaction operations (Buy, Sell, Send, Receive)
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { isUsdtFamilyCurrency } from './crypto.unified.usdt';
import profitLedgerService from '../profit/profit.ledger.service';
import { resolveCryptoSpreadForBuy, resolveCryptoSpreadForSell } from '../profit/profit.crypto.rates';
import { formatNairaAmount } from '../../utils/nairaAmount';

export type CryptoTxType = 'BUY' | 'SELL' | 'SEND' | 'RECEIVE' | 'SWAP';
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
  rate?: string | number; // Legacy field
  rateNgnToUsd?: string | number; // NGN to USD rate (Naira per $1)
  rateUsdToCrypto?: string | number; // USD to Crypto rate (crypto price in USD)
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
  rate?: string | number; // Legacy field
  rateCryptoToUsd?: string | number; // Crypto to USD rate (crypto price in USD)
  rateUsdToNgn?: string | number; // USD to NGN rate (Naira per $1)
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
  grossAmount?: string | number;
  creditedAmount?: string | number;
  grossAmountUsd?: string | number;
  creditedAmountUsd?: string | number;
  serviceFeePercent?: string | number;
  serviceFeeAmount?: string | number;
  serviceFeeUsd?: string | number;
}

interface CreateCryptoSwapData {
  userId: number;
  fromVirtualAccountId?: number;
  toVirtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  fromCurrency: string;
  fromBlockchain: string;
  fromAmount: string | number;
  fromAmountUsd: string | number;
  toCurrency: string;
  toBlockchain: string;
  toAmount: string | number;
  toAmountUsd: string | number;
  rateFromToUsd?: string | number;
  rateToToUsd?: string | number;
  gasFee: string | number;
  gasFeeUsd: string | number;
  totalAmount: string | number;
  totalAmountUsd: string | number;
  txHash?: string;
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
            rate: buyData.rate ? new Decimal(buyData.rate) : null, // Legacy field
            rateNgnToUsd: buyData.rateNgnToUsd ? new Decimal(buyData.rateNgnToUsd) : null,
            rateUsdToCrypto: buyData.rateUsdToCrypto ? new Decimal(buyData.rateUsdToCrypto) : null,
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

    const spreadRates = await resolveCryptoSpreadForBuy({
      amountUsd: buyData.amountUsd,
      amountNgn: buyData.amountNaira,
      rateNgnToUsd: buyData.rateNgnToUsd?.toString(),
    });
    await profitLedgerService.record({
      sourceTransactionType: 'CRYPTO_TRANSACTION',
      sourceTransactionId: cryptoTransaction.transactionId,
      transactionType: 'BUY',
      asset: cryptoTransaction.currency,
      blockchain: cryptoTransaction.blockchain,
      amount: spreadRates?.spreadAmount ?? buyData.amountUsd,
      amountUsd: buyData.amountUsd,
      amountNgn: buyData.amountNaira,
      buyRate: spreadRates?.buyRate ?? buyData.rateNgnToUsd,
      sellRate: spreadRates?.sellRate ?? buyData.rateNgnToUsd,
      asOf: cryptoTransaction.createdAt,
      meta: {
        cryptoTransactionId: cryptoTransaction.id,
        child: 'cryptoBuy',
        amountCrypto: buyData.amount,
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
            rate: sellData.rate ? new Decimal(sellData.rate) : null, // Legacy field
            rateCryptoToUsd: sellData.rateCryptoToUsd ? new Decimal(sellData.rateCryptoToUsd) : null,
            rateUsdToNgn: sellData.rateUsdToNgn ? new Decimal(sellData.rateUsdToNgn) : null,
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

    const spreadRates = await resolveCryptoSpreadForSell({
      amountUsd: sellData.amountUsd,
      amountNgn: sellData.amountNaira,
      rateUsdToNgn: sellData.rateUsdToNgn?.toString(),
    });
    await profitLedgerService.record({
      sourceTransactionType: 'CRYPTO_TRANSACTION',
      sourceTransactionId: cryptoTransaction.transactionId,
      transactionType: 'SELL',
      asset: cryptoTransaction.currency,
      blockchain: cryptoTransaction.blockchain,
      amount: spreadRates?.spreadAmount ?? sellData.amountUsd,
      amountUsd: sellData.amountUsd,
      amountNgn: sellData.amountNaira,
      buyRate: spreadRates?.buyRate ?? sellData.rateUsdToNgn,
      sellRate: spreadRates?.sellRate ?? sellData.rateUsdToNgn,
      asOf: cryptoTransaction.createdAt,
      meta: {
        cryptoTransactionId: cryptoTransaction.id,
        child: 'cryptoSell',
        amountCrypto: sellData.amount,
        rateCryptoToUsd: sellData.rateCryptoToUsd,
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

    await profitLedgerService.record({
      sourceTransactionType: 'CRYPTO_TRANSACTION',
      sourceTransactionId: cryptoTransaction.transactionId,
      transactionType: 'SEND',
      asset: cryptoTransaction.currency,
      blockchain: cryptoTransaction.blockchain,
      amount: sendData.amount,
      amountUsd: sendData.amountUsd,
      amountNgn: sendData.amountNaira,
      service: 'crypto_send',
      asOf: cryptoTransaction.createdAt,
      meta: { cryptoTransactionId: cryptoTransaction.id, child: 'cryptoSend', networkFee: sendData.networkFee ?? null },
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

    const grossCrypto = new Decimal(receiveData.grossAmount ?? receiveData.amount);
    const creditedCrypto = new Decimal(receiveData.creditedAmount ?? receiveData.amount);
    const grossUsd = new Decimal(receiveData.grossAmountUsd ?? receiveData.amountUsd);
    const creditedUsd = new Decimal(receiveData.creditedAmountUsd ?? receiveData.amountUsd);
    const feeCrypto = receiveData.serviceFeeAmount != null ? new Decimal(receiveData.serviceFeeAmount) : grossCrypto.minus(creditedCrypto);
    const feeUsd = receiveData.serviceFeeUsd != null ? new Decimal(receiveData.serviceFeeUsd) : grossUsd.minus(creditedUsd);
    const feePercent = receiveData.serviceFeePercent != null ? new Decimal(receiveData.serviceFeePercent) : new Decimal(0);

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
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
            amount: grossCrypto,
            grossAmount: grossCrypto,
            creditedAmount: creditedCrypto,
            amountUsd: grossUsd,
            grossAmountUsd: grossUsd,
            creditedAmountUsd: creditedUsd,
            serviceFeePercent: feePercent.gt(0) ? feePercent : null,
            serviceFeeAmount: feeCrypto.gt(0) ? feeCrypto : null,
            serviceFeeUsd: feeUsd.gt(0) ? feeUsd : null,
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

    if (feeUsd.gt(0)) {
      const feeNgn =
        receiveData.amountNaira && grossUsd.gt(0)
          ? new Decimal(receiveData.amountNaira).mul(feeUsd).div(grossUsd)
          : null;

      await profitLedgerService.record({
        sourceTransactionType: 'CRYPTO_TRANSACTION',
        sourceTransactionId: cryptoTransaction.transactionId,
        transactionType: 'RECEIVE',
        asset: cryptoTransaction.currency,
        blockchain: cryptoTransaction.blockchain,
        service: 'crypto_deposit_fee',
        amount: feeUsd.toString(),
        amountUsd: feeUsd.toString(),
        amountNgn: feeNgn?.toString(),
        asOf: cryptoTransaction.createdAt,
        eventKey: `CRYPTO_TRANSACTION:${cryptoTransaction.transactionId}:DEPOSIT_FEE`,
        forcedProfit: {
          profitType: 'PERCENTAGE',
          profitValue: feeUsd.toString(),
          profitNgn: feeNgn?.toString() ?? feeUsd.toString(),
          notes: `Crypto deposit service fee (${feePercent.toString()}%).`,
        },
        meta: {
          cryptoTransactionId: cryptoTransaction.id,
          child: 'cryptoReceive',
          feePercent: feePercent.toString(),
          grossAmountUsd: grossUsd.toString(),
          creditedAmountUsd: creditedUsd.toString(),
        },
      });
    }

    return cryptoTransaction;
  }

  /**
   * Create a crypto swap transaction
   */
  async createSwapTransaction(data: CreateCryptoSwapData) {
    const { userId, fromVirtualAccountId, toVirtualAccountId, transactionId, status = 'successful', ...swapData } = data;
    
    // Get virtual accounts to determine currencies and blockchains
    const fromVirtualAccount = fromVirtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: fromVirtualAccountId } })
      : null;
    const toVirtualAccount = toVirtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: toVirtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId: fromVirtualAccountId, // Primary virtual account (the one being debited)
        transactionType: 'SWAP',
        transactionId,
        status,
        currency: swapData.fromCurrency,
        blockchain: swapData.fromBlockchain,
        cryptoSwap: {
          create: {
            fromAddress: swapData.fromAddress || null,
            toAddress: swapData.toAddress || null,
            fromCurrency: swapData.fromCurrency,
            fromBlockchain: swapData.fromBlockchain,
            fromAmount: new Decimal(swapData.fromAmount),
            fromAmountUsd: new Decimal(swapData.fromAmountUsd),
            toCurrency: swapData.toCurrency,
            toBlockchain: swapData.toBlockchain,
            toAmount: new Decimal(swapData.toAmount),
            toAmountUsd: new Decimal(swapData.toAmountUsd),
            rateFromToUsd: swapData.rateFromToUsd ? new Decimal(swapData.rateFromToUsd) : null,
            rateToToUsd: swapData.rateToToUsd ? new Decimal(swapData.rateToToUsd) : null,
            gasFee: new Decimal(swapData.gasFee),
            gasFeeUsd: new Decimal(swapData.gasFeeUsd),
            totalAmount: new Decimal(swapData.totalAmount),
            totalAmountUsd: new Decimal(swapData.totalAmountUsd),
            txHash: swapData.txHash || null,
          },
        },
      },
      include: {
        cryptoSwap: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    await profitLedgerService.record({
      sourceTransactionType: 'CRYPTO_TRANSACTION',
      sourceTransactionId: cryptoTransaction.transactionId,
      transactionType: 'SWAP',
      asset: swapData.fromCurrency,
      blockchain: swapData.fromBlockchain,
      amount: swapData.fromAmount,
      amountUsd: swapData.fromAmountUsd,
      service: 'crypto_swap',
      asOf: cryptoTransaction.createdAt,
      meta: {
        cryptoTransactionId: cryptoTransaction.id,
        child: 'cryptoSwap',
        toCurrency: swapData.toCurrency,
        toBlockchain: swapData.toBlockchain,
        toAmount: swapData.toAmount,
        toAmountUsd: swapData.toAmountUsd,
        gasFee: swapData.gasFee,
        gasFeeUsd: swapData.gasFeeUsd,
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
          cryptoSwap: true,
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
      transactions: transactions.map((tx) => this.formatTransaction(tx)),
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
        cryptoSwap: true,
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
    const va = await prisma.virtualAccount.findFirst({
      where: { id: virtualAccountId, userId },
    });

    let virtualAccountIds = [virtualAccountId];
    if (va && isUsdtFamilyCurrency(va.currency)) {
      const family = await prisma.virtualAccount.findMany({
        where: {
          userId,
          OR: [{ currency: 'USDT' }, { currency: { startsWith: 'USDT_' } }],
        },
        select: { id: true },
      });
      virtualAccountIds = family.map((f) => f.id);
    }

    const [transactions, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where: {
          userId,
          virtualAccountId: { in: virtualAccountIds },
        },
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
        take: limit,
        skip: offset,
      }),
      prisma.cryptoTransaction.count({
        where: {
          userId,
          virtualAccountId: { in: virtualAccountIds },
        },
      }),
    ]);

    return {
      transactions: transactions.map((tx) => this.formatTransaction(tx)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get all USDT transactions for a user
   * Returns transactions where currency contains "USDT" (e.g., USDT, USDT_TRON, USDT_ETH, USDT_BSC)
   */
  async getUsdtTransactions(
    userId: number,
    transactionType?: CryptoTxType,
    limit: number = 50,
    offset: number = 0
  ) {
    // Get all USDT virtual accounts for this user
    const usdtVirtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId,
        OR: [
          { currency: 'USDT' },
          { currency: { startsWith: 'USDT_' } },
        ],
      },
      select: { id: true },
    });

    const usdtVirtualAccountIds = usdtVirtualAccounts.map(va => va.id);

    // Build where clause - match by currency field OR virtual account
    const baseWhere: any = {
      userId,
    };

    if (transactionType) {
      baseWhere.transactionType = transactionType;
    }

    // Build OR condition for USDT matching
    const orConditions: any[] = [];
    
    // Match by currency field (for non-swap transactions)
    orConditions.push({
      OR: [
        { currency: 'USDT' },
        { currency: { startsWith: 'USDT_' } },
      ],
    });

    // Match by virtual account IDs
    if (usdtVirtualAccountIds.length > 0) {
      orConditions.push({
        virtualAccountId: { in: usdtVirtualAccountIds },
      });
    }

    baseWhere.OR = orConditions;

    // First, get all transactions (including swaps for filtering)
    const allTransactions = await prisma.cryptoTransaction.findMany({
      where: baseWhere,
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
    });

    // Filter to include swaps where fromCurrency or toCurrency is USDT
    const usdtTransactions = allTransactions.filter((tx) => {
      // For swap transactions, check both fromCurrency and toCurrency
      if (tx.transactionType === 'SWAP' && tx.cryptoSwap) {
        const fromCurrency = tx.cryptoSwap.fromCurrency?.toUpperCase() || '';
        const toCurrency = tx.cryptoSwap.toCurrency?.toUpperCase() || '';
        return fromCurrency === 'USDT' || fromCurrency.startsWith('USDT_') ||
               toCurrency === 'USDT' || toCurrency.startsWith('USDT_');
      }
      // For other transactions, they should already match via the where clause
      return true;
    });

    // Apply pagination after filtering
    const total = usdtTransactions.length;
    const paginatedTransactions = usdtTransactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions.map((tx) => this.formatTransaction(tx)),
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
      id: transaction.id, // Integer ID
      transactionId: transaction.transactionId, // String transaction ID
      transactionType: transaction.transactionType,
      status: transaction.status,
      currency: transaction.currency,
      blockchain: transaction.blockchain,
      symbol: transaction.virtualAccount?.walletCurrency?.symbol || null, // Currency symbol (icon path)
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
        amountNaira: `NGN${formatNairaAmount(transaction.cryptoBuy.amountNaira)}`,
        rate: transaction.cryptoBuy.rate ? `NGN${formatNairaAmount(transaction.cryptoBuy.rate)}/$` : null,
        rateNgnToUsd: transaction.cryptoBuy.rateNgnToUsd ? transaction.cryptoBuy.rateNgnToUsd.toString() : null, // NGN to USD rate
        rateUsdToCrypto: transaction.cryptoBuy.rateUsdToCrypto ? transaction.cryptoBuy.rateUsdToCrypto.toString() : null, // USD to Crypto rate
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
        youReceived: `NGN${formatNairaAmount(transaction.cryptoSell.amountNaira)}`,
        amountNaira: `NGN${formatNairaAmount(transaction.cryptoSell.amountNaira)}`,
        rate: transaction.cryptoSell.rate ? `NGN${formatNairaAmount(transaction.cryptoSell.rate)}/$` : null,
        rateCryptoToUsd: transaction.cryptoSell.rateCryptoToUsd ? transaction.cryptoSell.rateCryptoToUsd.toString() : null, // Crypto to USD rate
        rateUsdToNgn: transaction.cryptoSell.rateUsdToNgn ? transaction.cryptoSell.rateUsdToNgn.toString() : null, // USD to NGN rate
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
          ? `NGN${formatNairaAmount(transaction.cryptoSend.amountNaira)}` 
          : null,
        rate: transaction.cryptoSend.rate ? `NGN${formatNairaAmount(transaction.cryptoSend.rate)}/$` : null,
        txHash: transaction.cryptoSend.txHash,
        networkFee: transaction.cryptoSend.networkFee?.toString(),
      };
    }

    if (transaction.cryptoReceive) {
      const recv = transaction.cryptoReceive;
      const grossUsd = recv.grossAmountUsd ?? recv.amountUsd;
      const creditedUsd = recv.creditedAmountUsd ?? recv.amountUsd;
      const grossCrypto = recv.grossAmount ?? recv.amount;
      const creditedCrypto = recv.creditedAmount ?? recv.amount;
      const feeUsd = recv.serviceFeeUsd;
      const feeCrypto = recv.serviceFeeAmount;
      const feePct = recv.serviceFeePercent;

      return {
        ...base,
        from: recv.fromAddress,
        to: recv.toAddress || 'Your Crypto wallet',
        amount: `${creditedCrypto.toString()}${transaction.currency}`,
        amountUsd: `$${creditedUsd.toString()}`,
        grossAmount: `${grossCrypto.toString()}${transaction.currency}`,
        grossAmountUsd: `$${grossUsd.toString()}`,
        creditedAmount: `${creditedCrypto.toString()}${transaction.currency}`,
        creditedAmountUsd: `$${creditedUsd.toString()}`,
        serviceFeeAmount: feeCrypto ? `${feeCrypto.toString()}${transaction.currency}` : null,
        serviceFeeUsd: feeUsd ? `$${feeUsd.toString()}` : null,
        serviceFeePercent: feePct ? `${feePct.toString()}%` : null,
        amountNaira: recv.amountNaira ? `NGN${formatNairaAmount(recv.amountNaira)}` : null,
        rate: recv.rate ? `$${recv.rate.toString()}` : null,
        txHash: recv.txHash,
        confirmations: recv.confirmations,
      };
    }

    if (transaction.cryptoSwap) {
      // Get symbol for both currencies
      const fromSymbol = transaction.virtualAccount?.walletCurrency?.symbol || null;
      // For swap, we might need to get the toCurrency symbol from a different virtual account
      // For now, we'll just use the base symbol
      
      // Primary amount shows what was received (toAmount) as the main transaction amount
      const toAmountStr = `${transaction.cryptoSwap.toAmount.toString()}${transaction.cryptoSwap.toCurrency}`;
      const fromAmountStr = `${transaction.cryptoSwap.fromAmount.toString()}${transaction.cryptoSwap.fromCurrency}`;
      
      return {
        ...base,
        // Primary amount field (what was received)
        amount: toAmountStr,
        amountUsd: `$${transaction.cryptoSwap.toAmountUsd.toString()}`,
        // Swap-specific fields
        from: transaction.cryptoSwap.fromAddress || 'Your Crypto wallet',
        to: transaction.cryptoSwap.toAddress || 'Your Crypto wallet',
        fromCurrency: transaction.cryptoSwap.fromCurrency,
        fromBlockchain: transaction.cryptoSwap.fromBlockchain,
        fromAmount: fromAmountStr,
        fromAmountUsd: `$${transaction.cryptoSwap.fromAmountUsd.toString()}`,
        toCurrency: transaction.cryptoSwap.toCurrency,
        toBlockchain: transaction.cryptoSwap.toBlockchain,
        toAmount: toAmountStr,
        toAmountUsd: `$${transaction.cryptoSwap.toAmountUsd.toString()}`,
        gasFee: `${transaction.cryptoSwap.gasFee.toString()}${transaction.cryptoSwap.fromCurrency}`,
        gasFeeUsd: `$${transaction.cryptoSwap.gasFeeUsd.toString()}`,
        totalAmount: `${transaction.cryptoSwap.totalAmount.toString()}${transaction.cryptoSwap.fromCurrency}`,
        totalAmountUsd: `$${transaction.cryptoSwap.totalAmountUsd.toString()}`,
        rateFromToUsd: transaction.cryptoSwap.rateFromToUsd ? transaction.cryptoSwap.rateFromToUsd.toString() : null,
        rateToToUsd: transaction.cryptoSwap.rateToToUsd ? transaction.cryptoSwap.rateToToUsd.toString() : null,
        txHash: transaction.cryptoSwap.txHash,
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
      SWAP: 'Crypto Swap',
    };
    return labels[type] || type;
  }
}

export default new CryptoTransactionService();

