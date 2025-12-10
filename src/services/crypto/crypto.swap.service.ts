/**
 * Crypto Swap Service
 * 
 * Handles crypto swap operations:
 * - Validates user crypto balances
 * - Calculates swap rates and gas fees
 * - Debits from currency and credits to currency
 * - Creates transaction records
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoRateService from './crypto.rate.service';
import cryptoTransactionService from './crypto.transaction.service';

export interface SwapCryptoInput {
  userId: number;
  fromAmount: number; // Amount in fromCurrency (e.g., 0.0024 ETH)
  fromCurrency: string; // Currency to swap FROM (e.g., ETH)
  fromBlockchain: string; // Blockchain of fromCurrency (e.g., ethereum)
  toCurrency: string; // Currency to swap TO (e.g., USDC)
  toBlockchain: string; // Blockchain of toCurrency (e.g., ethereum)
}

export interface SwapCryptoResult {
  transactionId: string;
  fromAmount: string;
  fromAmountUsd: string;
  toAmount: string;
  toAmountUsd: string;
  gasFee: string;
  gasFeeUsd: string;
  totalAmount: string;
  totalAmountUsd: string;
  rateFromToUsd: string;
  rateToToUsd: string;
  fromVirtualAccountId: number;
  toVirtualAccountId: number;
  fromBalanceBefore: string;
  fromBalanceAfter: string;
  toBalanceBefore: string;
  toBalanceAfter: string;
}

export interface SwapQuoteResult {
  fromAmount: string;
  fromAmountUsd: string;
  toAmount: string;
  toAmountUsd: string;
  gasFee: string;
  gasFeeUsd: string;
  totalAmount: string;
  totalAmountUsd: string;
  rateFromToUsd: string;
  rateToToUsd: string;
  fromCurrency: string;
  fromBlockchain: string;
  toCurrency: string;
  toBlockchain: string;
  fromCurrencyName: string;
  fromCurrencySymbol: string | null;
  toCurrencyName: string;
  toCurrencySymbol: string | null;
}

class CryptoSwapService {
  /**
   * Calculate gas fee estimate
   * For now, uses a fixed percentage or can be enhanced with actual gas estimation
   */
  private calculateGasFee(fromAmountUsd: Decimal, fromCurrency: string, fromBlockchain: string, fromPrice: Decimal): { gasFee: Decimal; gasFeeUsd: Decimal } {
    // For now, use a fixed percentage (0.5% of the swap amount) or minimum fee
    // In future, this should call blockchain-specific gas estimation APIs
    const gasFeePercentage = new Decimal('0.005'); // 0.5%
    const minimumGasFeeUsd = new Decimal('5'); // Minimum $5 gas fee
    
    let gasFeeUsd = fromAmountUsd.mul(gasFeePercentage);
    if (gasFeeUsd.lessThan(minimumGasFeeUsd)) {
      gasFeeUsd = minimumGasFeeUsd;
    }

    // Convert gas fee USD to fromCurrency using the fromCurrency price
    const gasFee = gasFeeUsd.div(fromPrice);

    return { gasFee, gasFeeUsd };
  }

  /**
   * Calculate swap quote
   */
  async calculateSwapQuote(input: SwapCryptoInput): Promise<SwapQuoteResult> {
    const { fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = input;

    // Step 1: Validate both currencies exist
    const fromWalletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: fromCurrency.toUpperCase(),
        blockchain: fromBlockchain.toLowerCase(),
      },
    });

    const toWalletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: toCurrency.toUpperCase(),
        blockchain: toBlockchain.toLowerCase(),
      },
    });

    if (!fromWalletCurrency) {
      throw new Error(`Currency ${fromCurrency} on ${fromBlockchain} is not supported`);
    }
    if (!toWalletCurrency) {
      throw new Error(`Currency ${toCurrency} on ${toBlockchain} is not supported`);
    }

    // Step 2: Get prices (with null checks)
    if (!fromWalletCurrency.price) {
      throw new Error(`Price not available for ${fromCurrency} on ${fromBlockchain}`);
    }
    if (!toWalletCurrency.price) {
      throw new Error(`Price not available for ${toCurrency} on ${toBlockchain}`);
    }

    const fromPrice = new Decimal(fromWalletCurrency.price.toString());
    const toPrice = new Decimal(toWalletCurrency.price.toString());

    // Step 3: Calculate USD value of fromAmount
    const fromAmountDecimal = new Decimal(fromAmount);
    const fromAmountUsd = fromAmountDecimal.mul(fromPrice);

    // Step 4: Calculate toAmount (USD value / toCurrency price)
    const toAmountDecimal = fromAmountUsd.div(toPrice);
    const toAmountUsd = toAmountDecimal.mul(toPrice); // Should equal fromAmountUsd

    // Step 5: Calculate gas fee
    const { gasFee, gasFeeUsd } = this.calculateGasFee(fromAmountUsd, fromCurrency, fromBlockchain, fromPrice);

    // Step 6: Calculate total (fromAmount + gasFee)
    const totalAmount = fromAmountDecimal.plus(gasFee);
    const totalAmountUsd = fromAmountUsd.plus(gasFeeUsd);

    return {
      fromAmount: fromAmountDecimal.toString(),
      fromAmountUsd: fromAmountUsd.toString(),
      toAmount: toAmountDecimal.toString(),
      toAmountUsd: toAmountUsd.toString(),
      gasFee: gasFee.toString(),
      gasFeeUsd: gasFeeUsd.toString(),
      totalAmount: totalAmount.toString(),
      totalAmountUsd: totalAmountUsd.toString(),
      rateFromToUsd: fromPrice.toString(),
      rateToToUsd: toPrice.toString(),
      fromCurrency: fromCurrency.toUpperCase(),
      fromBlockchain: fromBlockchain.toLowerCase(),
      toCurrency: toCurrency.toUpperCase(),
      toBlockchain: toBlockchain.toLowerCase(),
      fromCurrencyName: fromWalletCurrency.name,
      fromCurrencySymbol: fromWalletCurrency.symbol || null,
      toCurrencyName: toWalletCurrency.name,
      toCurrencySymbol: toWalletCurrency.symbol || null,
    };
  }

  /**
   * Get available currencies for swapping (user must have balance > 0 in fromCurrency)
   */
  async getAvailableCurrenciesForSwap(userId: number) {
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId,
        availableBalance: { gt: '0' },
      },
      include: {
        walletCurrency: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return virtualAccounts.map((account) => ({
      id: account.id,
      currency: account.currency,
      blockchain: account.blockchain,
      name: account.walletCurrency?.name || account.currency,
      symbol: account.walletCurrency?.symbol || null,
      price: account.walletCurrency?.price?.toString() || '0',
      nairaPrice: account.walletCurrency?.nairaPrice?.toString() || '0',
      isToken: account.walletCurrency?.isToken || false,
      tokenType: account.walletCurrency?.tokenType,
      blockchainName: account.walletCurrency?.blockchainName,
      availableBalance: account.availableBalance.toString(),
      virtualAccountId: account.id,
      displayName: `${account.currency} (${account.blockchain})`,
    }));
  }

  /**
   * Preview swap transaction
   */
  async previewSwapTransaction(input: SwapCryptoInput) {
    const quote = await this.calculateSwapQuote(input);

    // Get user's virtual accounts
    const fromVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: input.userId,
        currency: input.fromCurrency.toUpperCase(),
        blockchain: input.fromBlockchain.toLowerCase(),
      },
    });

    const toVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: input.userId,
        currency: input.toCurrency.toUpperCase(),
        blockchain: input.toBlockchain.toLowerCase(),
      },
    });

    if (!fromVirtualAccount) {
      throw new Error(`Virtual account not found for ${input.fromCurrency} on ${input.fromBlockchain}`);
    }
    if (!toVirtualAccount) {
      throw new Error(`Virtual account not found for ${input.toCurrency} on ${input.toBlockchain}`);
    }

    const fromBalanceBefore = new Decimal(fromVirtualAccount.availableBalance || '0');
    const toBalanceBefore = new Decimal(toVirtualAccount.availableBalance || '0');
    const totalAmountDecimal = new Decimal(quote.totalAmount);
    const toAmountDecimal = new Decimal(quote.toAmount);

    // Check if user has sufficient balance (including gas fee)
    const hasSufficientBalance = fromBalanceBefore.gte(totalAmountDecimal);

    const fromBalanceAfter = hasSufficientBalance
      ? fromBalanceBefore.minus(totalAmountDecimal)
      : fromBalanceBefore;
    const toBalanceAfter = hasSufficientBalance
      ? toBalanceBefore.plus(toAmountDecimal)
      : toBalanceBefore;

    return {
      ...quote,
      fromBalanceBefore: fromBalanceBefore.toString(),
      toBalanceBefore: toBalanceBefore.toString(),
      fromBalanceAfter: fromBalanceAfter.toString(),
      toBalanceAfter: toBalanceAfter.toString(),
      hasSufficientBalance,
      canProceed: hasSufficientBalance,
      fromVirtualAccountId: fromVirtualAccount.id,
      toVirtualAccountId: toVirtualAccount.id,
    };
  }

  /**
   * Execute swap transaction
   * 
   * Current Implementation (Internal Ledger):
   * 1. Validate both currencies exist
   * 2. Calculate swap amounts and gas fees
   * 3. Validate user has sufficient balance (including gas)
   * 4. Debit fromCurrency (including gas) from virtual account
   * 5. Credit toCurrency to virtual account
   * 6. Create transaction record
   * 
   * TODO: Future Blockchain Implementation:
   * - Check user's deposit address has sufficient on-chain balance
   * - Estimate actual gas fees from blockchain
   * - Transfer fromCurrency from user address to master wallet
   * - Transfer toCurrency from master wallet to user address
   * - Keep detailed blockchain transaction records
   */
  async swapCrypto(input: SwapCryptoInput): Promise<SwapCryptoResult> {
    const { userId, fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = input;

    // Pre-transaction: Calculate quote and get virtual accounts (outside transaction to avoid timeout)
    const quote = await this.calculateSwapQuote(input);
    const totalAmountDecimal = new Decimal(quote.totalAmount);
    const toAmountDecimal = new Decimal(quote.toAmount);

    // Get virtual accounts (outside transaction)
    const fromVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: fromCurrency.toUpperCase(),
        blockchain: fromBlockchain.toLowerCase(),
      },
    });

    const toVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: toCurrency.toUpperCase(),
        blockchain: toBlockchain.toLowerCase(),
      },
    });

    if (!fromVirtualAccount) {
      throw new Error(`Virtual account not found for ${fromCurrency} on ${fromBlockchain}`);
    }
    if (!toVirtualAccount) {
      throw new Error(`Virtual account not found for ${toCurrency} on ${toBlockchain}`);
    }

    // Check balance
    const fromBalanceBefore = new Decimal(fromVirtualAccount.availableBalance || '0');
    if (fromBalanceBefore.lessThan(totalAmountDecimal)) {
      throw new Error(`Insufficient ${fromCurrency} balance. Required: ${totalAmountDecimal.toString()}, Available: ${fromBalanceBefore.toString()}`);
    }

    const toBalanceBefore = new Decimal(toVirtualAccount.availableBalance || '0');
    const fromBalanceAfter = fromBalanceBefore.minus(totalAmountDecimal);
    const toBalanceAfter = toBalanceBefore.plus(toAmountDecimal);

    // Now execute the transaction with increased timeout
    return await prisma.$transaction(async (tx) => {

      // Step 4: Debit fromCurrency (including gas fee)
      await tx.virtualAccount.update({
        where: { id: fromVirtualAccount.id },
        data: {
          availableBalance: fromBalanceAfter.toString(),
          accountBalance: fromBalanceAfter.toString(),
        },
      });

      // Step 5: Credit toCurrency
      await tx.virtualAccount.update({
        where: { id: toVirtualAccount.id },
        data: {
          availableBalance: toBalanceAfter.toString(),
          accountBalance: toBalanceAfter.toString(),
        },
      });

      // Step 6: Create transaction record (using transaction client)
      const transactionId = `SWAP-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const cryptoTransaction = await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId: fromVirtualAccount.id,
          transactionType: 'SWAP',
          transactionId,
          status: 'successful',
          currency: fromVirtualAccount.currency,
          blockchain: fromVirtualAccount.blockchain,
          cryptoSwap: {
            create: {
              fromCurrency: quote.fromCurrency,
              fromBlockchain: quote.fromBlockchain,
              fromAmount: new Decimal(quote.fromAmount),
              fromAmountUsd: new Decimal(quote.fromAmountUsd),
              toCurrency: quote.toCurrency,
              toBlockchain: quote.toBlockchain,
              toAmount: new Decimal(quote.toAmount),
              toAmountUsd: new Decimal(quote.toAmountUsd),
              rateFromToUsd: quote.rateFromToUsd ? new Decimal(quote.rateFromToUsd) : null,
              rateToToUsd: quote.rateToToUsd ? new Decimal(quote.rateToToUsd) : null,
              gasFee: new Decimal(quote.gasFee),
              gasFeeUsd: new Decimal(quote.gasFeeUsd),
              totalAmount: new Decimal(quote.totalAmount),
              totalAmountUsd: new Decimal(quote.totalAmountUsd),
            },
          },
        },
      });

      return {
        transactionId,
        fromAmount: quote.fromAmount,
        fromAmountUsd: quote.fromAmountUsd,
        toAmount: quote.toAmount,
        toAmountUsd: quote.toAmountUsd,
        gasFee: quote.gasFee,
        gasFeeUsd: quote.gasFeeUsd,
        totalAmount: quote.totalAmount,
        totalAmountUsd: quote.totalAmountUsd,
        rateFromToUsd: quote.rateFromToUsd,
        rateToToUsd: quote.rateToToUsd,
        fromVirtualAccountId: fromVirtualAccount.id,
        toVirtualAccountId: toVirtualAccount.id,
        fromBalanceBefore: fromBalanceBefore.toString(),
        fromBalanceAfter: fromBalanceAfter.toString(),
        toBalanceBefore: toBalanceBefore.toString(),
        toBalanceAfter: toBalanceAfter.toString(),
      };
    }, {
      maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
      timeout: 15000, // Maximum time the transaction can run (15 seconds)
    });
  }
}

export default new CryptoSwapService();

