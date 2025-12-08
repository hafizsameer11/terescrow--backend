/**
 * Crypto Buy Service
 * 
 * Handles crypto purchase operations:
 * - Validates user fiat balance
 * - Calculates rates (NGN to USD, USD to Crypto)
 * - Debits fiat wallet and credits virtual account
 * - Creates transaction records
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import cryptoRateService from './crypto.rate.service';
import cryptoTransactionService from './crypto.transaction.service';

export interface BuyCryptoInput {
  userId: number;
  amount: number; // Amount in NGN (fiat currency)
  currency: string; // Crypto currency to buy (e.g., BTC, ETH, USDT)
  blockchain: string; // Blockchain (e.g., bitcoin, ethereum, bsc)
}

export interface BuyCryptoResult {
  transactionId: string;
  amountNgn: string;
  amountUsd: string;
  amountCrypto: string;
  rateNgnToUsd: string;
  rateUsdToCrypto: string;
  fiatWalletId: string;
  virtualAccountId: number;
  balanceBefore: string;
  balanceAfter: string;
  cryptoBalanceBefore: string;
  cryptoBalanceAfter: string;
}

class CryptoBuyService {
  /**
   * Buy cryptocurrency with fiat (NGN)
   * 
   * Current Implementation (Internal Ledger):
   * 1. Validate user has sufficient fiat balance
   * 2. Get NGN to USD rate from crypto_rates table (BUY transaction type)
   * 3. Convert NGN to USD
   * 4. Get crypto price from wallet_currencies table
   * 5. Calculate crypto amount
   * 6. Debit fiat wallet
   * 7. Credit virtual account (internal ledger)
   * 8. Create transaction record
   * 
   * TODO: Future Blockchain Implementation:
   * The following steps will be implemented later for actual blockchain transfers:
   * 
   * 1. Check Master Wallet Balance:
   *    - Verify master wallet has sufficient crypto balance
   *    - Check if master wallet can cover the purchase amount
   *    - Handle insufficient master wallet balance scenarios
   * 
   * 2. Estimate Gas Fees:
   *    - Calculate network fees for the blockchain transfer
   *    - Include gas fees in the total cost calculation
   *    - Show estimated fees to user before confirmation
   * 
   * 3. Execute Blockchain Transfer:
   *    - Transfer crypto from master wallet to user's deposit address
   *    - Use Tatum API or direct blockchain interaction
   *    - Wait for transaction confirmation
   *    - Handle transaction failures and retries
   * 
   * 4. Record Blockchain Transaction:
   *    - Store transaction hash (txHash) in database
   *    - Record block number and confirmations
   *    - Link blockchain transaction to crypto transaction record
   *    - Update transaction status based on blockchain confirmation
   * 
   * 5. Webhook Integration:
   *    - Listen for transaction confirmations via webhooks
   *    - Update virtual account balance when confirmed
   *    - Handle edge cases (failed transactions, reversals)
   * 
   * Note: Currently, this is an internal ledger operation.
   * The crypto is credited to the user's virtual account immediately,
   * but no actual blockchain transfer occurs yet.
   */
  async buyCrypto(input: BuyCryptoInput): Promise<BuyCryptoResult> {
    return await prisma.$transaction(async (tx) => {
      const { userId, amount, currency, blockchain } = input;

      // Step 1: Validate crypto currency exists in wallet_currencies
      const walletCurrency = await tx.walletCurrency.findFirst({
        where: {
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
        },
      });

      if (!walletCurrency) {
        throw new Error(`Currency ${currency} on ${blockchain} is not supported`);
      }

      if (!walletCurrency.price) {
        throw new Error(`Price not set for ${currency}`);
      }

      // Step 2: Get user's fiat wallet (NGN)
      const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
      
      // Check sufficient balance
      const balanceBefore = new Decimal(fiatWallet.balance);
      const amountDecimal = new Decimal(amount);
      
      if (balanceBefore.lessThan(amountDecimal)) {
        throw new Error('Insufficient fiat balance');
      }

      // Step 3: Get NGN to USD rate from crypto_rates (BUY transaction type)
      // Convert amount to USD for rate lookup
      // We'll use a rough estimate first, then recalculate
      const estimatedUsdAmount = amount / 1500; // Rough estimate
      const ngnToUsdRate = await cryptoRateService.getRateForAmount('BUY', estimatedUsdAmount);
      
      if (!ngnToUsdRate) {
        throw new Error('No rate found for BUY transaction. Please contact support.');
      }

      // Step 4: Convert NGN to USD
      const amountUsd = amountDecimal.dividedBy(new Decimal(ngnToUsdRate.rate.toString()));
      
      // Recalculate with actual USD amount if needed (for tiered rates)
      const actualNgnToUsdRate = await cryptoRateService.getRateForAmount('BUY', parseFloat(amountUsd.toString()));
      const finalAmountUsd = actualNgnToUsdRate 
        ? amountDecimal.dividedBy(new Decimal(actualNgnToUsdRate.rate.toString()))
        : amountUsd;

      // Step 5: Get crypto price from wallet_currencies
      const cryptoPrice = new Decimal(walletCurrency.price.toString());
      
      // Step 6: Calculate crypto amount
      const amountCrypto = finalAmountUsd.dividedBy(cryptoPrice);

      // TODO: Future Implementation - Check Master Wallet Balance
      // Before proceeding, verify master wallet has sufficient balance:
      // 1. Get master wallet for this blockchain
      // 2. Check master wallet balance (using Tatum API)
      // 3. Verify balance >= amountCrypto + estimated gas fees
      // 4. If insufficient, throw error or queue for later processing

      // TODO: Future Implementation - Estimate Gas Fees
      // Calculate network fees for blockchain transfer:
      // 1. Estimate gas fees based on blockchain (ETH, BSC, etc.)
      // 2. Add gas fees to total cost
      // 3. Recalculate if needed or show to user for confirmation

      // Step 7: Get or find user's virtual account for this currency
      let virtualAccount = await tx.virtualAccount.findFirst({
        where: {
          userId,
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
        },
      });

      if (!virtualAccount) {
        throw new Error(`Virtual account not found for ${currency} on ${blockchain}. Please contact support.`);
      }

      const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
      const cryptoBalanceAfter = cryptoBalanceBefore.plus(amountCrypto);

      // Step 8: Debit fiat wallet
      // Create fiat transaction first
      const fiatTransaction = await tx.fiatTransaction.create({
        data: {
          userId,
          walletId: fiatWallet.id,
          type: 'CRYPTO_BUY',
          status: 'pending',
          currency: 'NGN',
          amount: amountDecimal,
          fees: new Decimal('0'),
          totalAmount: amountDecimal,
          balanceBefore: balanceBefore,
          description: `Buy ${amountCrypto.toString()} ${currency}`,
        },
      });

      // Debit wallet
      const balanceAfter = balanceBefore.minus(amountDecimal);
      await tx.fiatWallet.update({
        where: { id: fiatWallet.id },
        data: { balance: balanceAfter },
      });

      // Update fiat transaction
      await tx.fiatTransaction.update({
        where: { id: fiatTransaction.id },
        data: {
          balanceAfter: balanceAfter,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Step 9: Credit virtual account
      await tx.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: cryptoBalanceAfter.toString(),
          accountBalance: cryptoBalanceAfter.toString(),
        },
      });

      // Step 10: Create crypto transaction record with all rates logged
      const transactionId = `BUY-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const ngnToUsdRateValue = actualNgnToUsdRate?.rate.toString() || ngnToUsdRate.rate.toString();
      const cryptoTransaction = await cryptoTransactionService.createBuyTransaction({
        userId,
        virtualAccountId: virtualAccount.id,
        transactionId,
        amount: amountCrypto.toString(),
        amountUsd: finalAmountUsd.toString(),
        amountNaira: amountDecimal.toString(),
        rate: cryptoPrice.toString(), // Legacy field
        rateNgnToUsd: ngnToUsdRateValue, // NGN to USD rate (logged)
        rateUsdToCrypto: cryptoPrice.toString(), // USD to Crypto rate (logged)
      });

      // TODO: Future Implementation - Execute Blockchain Transfer
      // After creating transaction record, execute actual blockchain transfer:
      // 1. Get user's deposit address for this currency/blockchain
      // 2. Get master wallet private key (decrypt if needed)
      // 3. Use Tatum API or blockchain SDK to transfer crypto:
      //    - From: Master wallet address
      //    - To: User's deposit address
      //    - Amount: amountCrypto
      //    - Include gas fees
      // 4. Wait for transaction confirmation
      // 5. Update crypto transaction with txHash, blockNumber, confirmations
      // 6. Update transaction status based on blockchain confirmation
      // 7. Handle failures: revert fiat debit, update transaction status

      return {
        transactionId: cryptoTransaction.id,
        amountNgn: amountDecimal.toString(),
        amountUsd: finalAmountUsd.toString(),
        amountCrypto: amountCrypto.toString(),
        rateNgnToUsd: actualNgnToUsdRate?.rate.toString() || ngnToUsdRate.rate.toString(),
        rateUsdToCrypto: cryptoPrice.toString(),
        fiatWalletId: fiatWallet.id,
        virtualAccountId: virtualAccount.id,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        cryptoBalanceBefore: cryptoBalanceBefore.toString(),
        cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      };
    });
  }

  /**
   * Calculate buy quote (preview before actual purchase)
   * Returns estimated amounts without executing the transaction
   */
  async calculateBuyQuote(amountNgn: number, currency: string, blockchain: string) {
    // Get wallet currency
    const walletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currency} on ${blockchain} is not supported or price not set`);
    }

    // Get NGN to USD rate
    const estimatedUsdAmount = amountNgn / 1500; // Rough estimate
    const ngnToUsdRate = await cryptoRateService.getRateForAmount('BUY', estimatedUsdAmount);
    
    if (!ngnToUsdRate) {
      throw new Error('No rate found for BUY transaction');
    }

    const amountDecimal = new Decimal(amountNgn);
    const amountUsd = amountDecimal.dividedBy(new Decimal(ngnToUsdRate.rate.toString()));
    
    // Recalculate with actual USD amount
    const actualNgnToUsdRate = await cryptoRateService.getRateForAmount('BUY', parseFloat(amountUsd.toString()));
    const finalAmountUsd = actualNgnToUsdRate 
      ? amountDecimal.dividedBy(new Decimal(actualNgnToUsdRate.rate.toString()))
      : amountUsd;

    // Calculate crypto amount
    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCrypto = finalAmountUsd.dividedBy(cryptoPrice);

    return {
      amountNgn: amountDecimal.toString(),
      amountUsd: finalAmountUsd.toString(),
      amountCrypto: amountCrypto.toString(),
      rateNgnToUsd: actualNgnToUsdRate?.rate.toString() || ngnToUsdRate.rate.toString(),
      rateUsdToCrypto: cryptoPrice.toString(),
      currency: currency.toUpperCase(),
      blockchain: blockchain.toLowerCase(),
      currencyName: walletCurrency.name,
      currencySymbol: walletCurrency.symbol,
    };
  }

  /**
   * Preview buy transaction with complete details (finalize step)
   * Includes current balances, rates, and all transaction details
   */
  async previewBuyTransaction(userId: number, amountNgn: number, currency: string, blockchain: string) {
    // Get wallet currency
    const walletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currency} on ${blockchain} is not supported or price not set`);
    }

    // Get user's fiat wallet
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const fiatBalance = new Decimal(fiatWallet.balance);

    // Get user's virtual account for this crypto
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
    }

    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');

    // Calculate quote
    const quote = await this.calculateBuyQuote(amountNgn, currency, blockchain);
    const amountDecimal = new Decimal(amountNgn);
    const amountCryptoDecimal = new Decimal(quote.amountCrypto);

    // Calculate balances after transaction
    const fiatBalanceAfter = fiatBalance.minus(amountDecimal);
    const cryptoBalanceAfter = cryptoBalanceBefore.plus(amountCryptoDecimal);

    // Check if sufficient balance
    const hasSufficientBalance = fiatBalance.gte(amountDecimal);

    return {
      // Transaction details
      currency: quote.currency,
      blockchain: quote.blockchain,
      currencyName: quote.currencyName,
      currencySymbol: quote.currencySymbol,
      
      // Amounts
      amountNgn: quote.amountNgn,
      amountUsd: quote.amountUsd,
      amountCrypto: quote.amountCrypto,
      
      // Rates
      rateNgnToUsd: quote.rateNgnToUsd,
      rateUsdToCrypto: quote.rateUsdToCrypto,
      
      // Current balances
      fiatBalanceBefore: fiatBalance.toString(),
      cryptoBalanceBefore: cryptoBalanceBefore.toString(),
      
      // Projected balances after transaction
      fiatBalanceAfter: fiatBalanceAfter.toString(),
      cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      
      // Validation
      hasSufficientBalance,
      canProceed: hasSufficientBalance,
      
      // Additional info
      fiatWalletId: fiatWallet.id,
      virtualAccountId: virtualAccount.id,
    };
  }

  /**
   * Get all available currencies for buying
   */
  async getAvailableCurrencies() {
    const currencies = await prisma.walletCurrency.findMany({
      where: {
        price: { not: null },
      },
      select: {
        id: true,
        currency: true,
        blockchain: true,
        name: true,
        symbol: true,
        price: true,
        nairaPrice: true,
        isToken: true,
        tokenType: true,
        blockchainName: true,
      },
      orderBy: [
        { isToken: 'asc' }, // Native coins first
        { currency: 'asc' },
      ],
    });

    return currencies.map((c) => ({
      id: c.id,
      currency: c.currency,
      blockchain: c.blockchain,
      name: c.name,
      symbol: c.symbol,
      price: c.price?.toString() || '0',
      nairaPrice: c.nairaPrice?.toString() || '0',
      isToken: c.isToken,
      tokenType: c.tokenType,
      blockchainName: c.blockchainName,
      displayName: `${c.currency}${c.isToken ? ` (${c.blockchainName || c.blockchain})` : ''}`,
    }));
  }
}

export default new CryptoBuyService();

