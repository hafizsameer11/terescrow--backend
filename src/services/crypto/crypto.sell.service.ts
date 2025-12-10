/**
 * Crypto Sell Service
 * 
 * Handles crypto sell operations:
 * - Validates user crypto balance
 * - Calculates rates (Crypto to USD, USD to NGN)
 * - Debits virtual account and credits fiat wallet
 * - Creates transaction records
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import cryptoRateService from './crypto.rate.service';
import cryptoTransactionService from './crypto.transaction.service';

export interface SellCryptoInput {
  userId: number;
  amount: number; // Amount in crypto (e.g., 0.001 BTC)
  currency: string; // Crypto currency to sell (e.g., BTC, ETH, USDT)
  blockchain: string; // Blockchain (e.g., bitcoin, ethereum, bsc)
}

export interface SellCryptoResult {
  transactionId: string;
  amountCrypto: string;
  amountUsd: string;
  amountNgn: string;
  rateCryptoToUsd: string;
  rateUsdToNgn: string;
  fiatWalletId: string;
  virtualAccountId: number;
  cryptoBalanceBefore: string;
  cryptoBalanceAfter: string;
  balanceBefore: string;
  balanceAfter: string;
}

class CryptoSellService {
  /**
   * Sell cryptocurrency for fiat (NGN)
   * 
   * Current Implementation (Internal Ledger):
   * 1. Validate user has sufficient crypto balance
   * 2. Get crypto price from wallet_currencies table
   * 3. Convert crypto to USD
   * 4. Get USD to NGN rate from crypto_rates table (SELL transaction type)
   * 5. Convert USD to NGN
   * 6. Debit virtual account (crypto)
   * 7. Credit fiat wallet (NGN)
   * 8. Create transaction record
   * 
   * TODO: Future Blockchain Implementation:
   * The following steps will be implemented later for actual blockchain transfers:
   * 
   * 1. Check User's Deposit Address Balance:
   *    - Verify user's deposit address has sufficient crypto balance
   *    - Check on-chain balance using Tatum API
   *    - Handle insufficient balance scenarios
   * 
   * 2. Estimate Gas Fees:
   *    - Calculate network fees for the blockchain transfer
   *    - Deduct gas fees from the sell amount
   *    - Show estimated fees to user before confirmation
   * 
   * 3. Execute Blockchain Transfer:
   *    - Transfer crypto from user's deposit address to master wallet
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
   *    - Update balances when confirmed
   *    - Handle edge cases (failed transactions, reversals)
   * 
   * Note: Currently, this is an internal ledger operation.
   * The crypto is debited from the user's virtual account immediately,
   * but no actual blockchain transfer occurs yet.
   */
  async sellCrypto(input: SellCryptoInput): Promise<SellCryptoResult> {
    const { userId, amount, currency, blockchain } = input;

    // Pre-transaction: Get wallet currency and rates (outside transaction to avoid timeout)
    const walletCurrency = await prisma.walletCurrency.findFirst({
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

    // Get user's virtual account (outside transaction)
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain}. Please contact support.`);
    }

    // Check sufficient crypto balance
    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
    const amountCryptoDecimal = new Decimal(amount);
    
    if (cryptoBalanceBefore.lessThan(amountCryptoDecimal)) {
      throw new Error('Insufficient crypto balance');
    }

    // Get crypto price
    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    
    // Convert crypto to USD
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // Get USD to NGN rate (outside transaction)
    const estimatedUsdAmount = parseFloat(amountUsd.toString());
    const usdToNgnRate = await cryptoRateService.getRateForAmount('SELL', estimatedUsdAmount);
    
    if (!usdToNgnRate) {
      throw new Error('No rate found for SELL transaction. Please contact support.');
    }

    // Convert USD to NGN
    const amountNgn = amountUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

    // Get user's fiat wallet (outside transaction)
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const balanceBefore = new Decimal(fiatWallet.balance);
    const balanceAfter = balanceBefore.plus(amountNgn);

    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);

    // Now execute the transaction with increased timeout
    return await prisma.$transaction(async (tx) => {

      // Step 9: Debit virtual account (crypto)
      await tx.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: cryptoBalanceAfter.toString(),
          accountBalance: cryptoBalanceAfter.toString(),
        },
      });

      // Step 10: Credit fiat wallet (NGN)
      // Create fiat transaction first
      const fiatTransaction = await tx.fiatTransaction.create({
        data: {
          userId,
          walletId: fiatWallet.id,
          type: 'CRYPTO_SELL',
          status: 'pending',
          currency: 'NGN',
          amount: amountNgn,
          fees: new Decimal('0'),
          totalAmount: amountNgn,
          balanceBefore: balanceBefore,
          description: `Sell ${amountCryptoDecimal.toString()} ${currency}`,
        },
      });

      // Credit wallet
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

      // TODO: Future Implementation - Check User's Deposit Address Balance
      // Before proceeding, verify user's deposit address has sufficient balance:
      // 1. Get user's deposit address for this currency/blockchain
      // 2. Check on-chain balance using Tatum API
      // 3. Verify balance >= amountCrypto + estimated gas fees
      // 4. If insufficient, throw error

      // TODO: Future Implementation - Estimate Gas Fees
      // Calculate network fees for blockchain transfer:
      // 1. Estimate gas fees based on blockchain (ETH, BSC, etc.)
      // 2. Deduct gas fees from amountCrypto
      // 3. Recalculate amounts if needed or show to user for confirmation

      // Step 11: Create crypto transaction record with all rates logged (using transaction client)
      const transactionId = `SELL-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const cryptoTransaction = await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId: virtualAccount.id,
          transactionType: 'SELL',
          transactionId,
          status: 'successful',
          currency: virtualAccount.currency,
          blockchain: virtualAccount.blockchain,
          cryptoSell: {
            create: {
              amount: amountCryptoDecimal,
              amountUsd: amountUsd,
              amountNaira: amountNgn,
              rateCryptoToUsd: cryptoPrice,
              rateUsdToNgn: new Decimal(usdToNgnRate.rate.toString()),
            },
          },
        },
      });

      // TODO: Future Implementation - Execute Blockchain Transfer
      // After creating transaction record, execute actual blockchain transfer:
      // 1. Get user's deposit address for this currency/blockchain
      // 2. Get user's private key (decrypt if needed) - for non-custodial
      //    OR use master wallet if custodial
      // 3. Use Tatum API or blockchain SDK to transfer crypto:
      //    - From: User's deposit address
      //    - To: Master wallet address
      //    - Amount: amountCrypto (minus gas fees)
      // 4. Wait for transaction confirmation
      // 5. Update crypto transaction with txHash, blockNumber, confirmations
      // 6. Update transaction status based on blockchain confirmation
      // 7. Handle failures: revert crypto debit, update transaction status

      return {
        transactionId: cryptoTransaction.transactionId, // Use string transactionId, not integer id
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNgn: amountNgn.toString(),
        rateCryptoToUsd: cryptoPrice.toString(),
        rateUsdToNgn: usdToNgnRate.rate.toString(),
        fiatWalletId: fiatWallet.id,
        virtualAccountId: virtualAccount.id,
        cryptoBalanceBefore: cryptoBalanceBefore.toString(),
        cryptoBalanceAfter: cryptoBalanceAfter.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
      };
    }, {
      maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
      timeout: 15000, // Maximum time the transaction can run (15 seconds)
    });
  }

  /**
   * Calculate sell quote (preview before selling)
   * Returns estimated NGN amount without executing the transaction
   */
  async calculateSellQuote(amountCrypto: number, currency: string, blockchain: string) {
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

    // Get crypto price
    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCryptoDecimal = new Decimal(amountCrypto);
    
    // Convert crypto to USD
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // Get USD to NGN rate
    const estimatedUsdAmount = parseFloat(amountUsd.toString());
    const usdToNgnRate = await cryptoRateService.getRateForAmount('SELL', estimatedUsdAmount);
    
    if (!usdToNgnRate) {
      throw new Error('No rate found for SELL transaction');
    }

    // Convert USD to NGN
    const amountNgn = amountUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

    return {
      amountCrypto: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      amountNgn: amountNgn.toString(),
      rateCryptoToUsd: cryptoPrice.toString(),
      rateUsdToNgn: usdToNgnRate.rate.toString(),
      currency: currency.toUpperCase(),
      blockchain: blockchain.toLowerCase(),
      currencyName: walletCurrency.name,
      currencySymbol: walletCurrency.symbol,
    };
  }

  /**
   * Preview sell transaction with complete details (finalize step)
   * Includes current balances, rates, and all transaction details
   */
  async previewSellTransaction(userId: number, amountCrypto: number, currency: string, blockchain: string) {
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
    const amountCryptoDecimal = new Decimal(amountCrypto);

    // Get user's fiat wallet
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const fiatBalanceBefore = new Decimal(fiatWallet.balance);

    // Calculate quote
    const quote = await this.calculateSellQuote(amountCrypto, currency, blockchain);
    const amountNgnDecimal = new Decimal(quote.amountNgn);

    // Calculate balances after transaction
    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);
    const fiatBalanceAfter = fiatBalanceBefore.plus(amountNgnDecimal);

    // Check if sufficient balance
    const hasSufficientBalance = cryptoBalanceBefore.gte(amountCryptoDecimal);

    return {
      // Transaction details
      currency: quote.currency,
      blockchain: quote.blockchain,
      currencyName: quote.currencyName,
      currencySymbol: quote.currencySymbol,
      
      // Amounts
      amountCrypto: quote.amountCrypto,
      amountUsd: quote.amountUsd,
      amountNgn: quote.amountNgn,
      
      // Rates
      rateCryptoToUsd: quote.rateCryptoToUsd,
      rateUsdToNgn: quote.rateUsdToNgn,
      
      // Current balances
      cryptoBalanceBefore: cryptoBalanceBefore.toString(),
      fiatBalanceBefore: fiatBalanceBefore.toString(),
      
      // Projected balances after transaction
      cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      fiatBalanceAfter: fiatBalanceAfter.toString(),
      
      // Validation
      hasSufficientBalance,
      canProceed: hasSufficientBalance,
      
      // Additional info
      virtualAccountId: virtualAccount.id,
      fiatWalletId: fiatWallet.id,
    };
  }

  /**
   * Get all available currencies for selling (user must have balance > 0)
   */
  async getAvailableCurrenciesForSell(userId: number) {
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId,
        availableBalance: { gt: '0' },
      },
      include: {
        walletCurrency: {
          where: {
            price: { not: null },
          },
        },
      },
    });

    // Filter out accounts without wallet currency or price
    const availableCurrencies = virtualAccounts
      .filter((va) => va.walletCurrency && va.walletCurrency.price)
      .map((va) => ({
        id: va.walletCurrency!.id,
        currency: va.currency,
        blockchain: va.blockchain,
        name: va.walletCurrency!.name,
        symbol: va.walletCurrency!.symbol,
        price: va.walletCurrency!.price?.toString() || '0',
        nairaPrice: va.walletCurrency!.nairaPrice?.toString() || '0',
        isToken: va.walletCurrency!.isToken,
        tokenType: va.walletCurrency!.tokenType,
        blockchainName: va.walletCurrency!.blockchainName,
        availableBalance: va.availableBalance,
        virtualAccountId: va.id,
        displayName: `${va.currency}${va.walletCurrency!.isToken ? ` (${va.walletCurrency!.blockchainName || va.blockchain})` : ''}`,
      }))
      .sort((a, b) => {
        // Sort by balance (descending), then by currency name
        const balanceA = new Decimal(a.availableBalance);
        const balanceB = new Decimal(b.availableBalance);
        if (balanceB.gt(balanceA)) return 1;
        if (balanceA.gt(balanceB)) return -1;
        return a.currency.localeCompare(b.currency);
      });

    return availableCurrencies;
  }
}

export default new CryptoSellService();

