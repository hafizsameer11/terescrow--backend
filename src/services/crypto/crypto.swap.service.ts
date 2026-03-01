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
import cryptoLogger from '../../utils/crypto.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

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
   * Calculate gas fee estimate for real blockchain swaps - COMMENTED OUT
   * For ETH ↔ USDT on Ethereum: calculates actual gas fees for both transfers
   * For other swaps: uses fixed percentage as fallback
   * BLOCKCHAIN CODE COMMENTED OUT - Using fallback calculation only
   */
  private async calculateGasFee(
    fromAmountUsd: Decimal,
    fromCurrency: string,
    fromBlockchain: string,
    fromPrice: Decimal,
    fromAddress?: string,
    toAddress?: string,
    fromAmount?: Decimal
  ): Promise<{ gasFee: Decimal; gasFeeUsd: Decimal; gasFeeEth: Decimal }> {
    // BLOCKCHAIN CODE COMMENTED OUT - Using fallback calculation only
    // For real blockchain swaps (ETH ↔ USDT on Ethereum), calculate actual gas fees
    /* if (fromBlockchain.toLowerCase() === 'ethereum' && 
        (fromCurrency.toUpperCase() === 'ETH' || fromCurrency.toUpperCase() === 'USDT') &&
        fromAddress && toAddress && fromAmount) {
      try {
        const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');
        
        // For swaps, we need gas for TWO transfers:
        // 1. User sends fromCurrency to master wallet
        // 2. Master wallet sends toCurrency to user
        
        // Estimate gas for user → master transfer (fromCurrency)
        const userToMasterGas = await ethereumGasService.estimateGasFee(
          fromAddress,
          toAddress,
          fromAmount.toString(),
          false // mainnet
        );
        
        let gasLimit1 = parseInt(userToMasterGas.gasLimit);
        if (fromCurrency.toUpperCase() === 'USDT') {
          gasLimit1 = Math.max(gasLimit1, 65000); // ERC-20 minimum
          gasLimit1 = Math.ceil(gasLimit1 * 1.2); // 20% buffer
        } else {
          gasLimit1 = Math.ceil(gasLimit1 * 1.1); // 10% buffer
        }
        
        // Estimate gas for master → user transfer (toCurrency)
        const masterToUserGas = await ethereumGasService.estimateGasFee(
          toAddress,
          fromAddress,
          fromAmount.toString(), // Use same amount for estimation
          false // mainnet
        );
        
        let gasLimit2 = parseInt(masterToUserGas.gasLimit);
        if (fromCurrency.toUpperCase() === 'ETH') {
          // If swapping ETH → USDT, master sends USDT (ERC-20)
          gasLimit2 = Math.max(gasLimit2, 65000);
          gasLimit2 = Math.ceil(gasLimit2 * 1.2);
        } else {
          // If swapping USDT → ETH, master sends ETH (native)
          gasLimit2 = Math.ceil(gasLimit2 * 1.1);
        }
        
        // Use the higher gas price from both estimates
        const gasPriceWei = userToMasterGas.gasPrice > masterToUserGas.gasPrice 
          ? userToMasterGas.gasPrice 
          : masterToUserGas.gasPrice;
        
        // Total gas limit is sum of both transfers
        const totalGasLimit = gasLimit1 + gasLimit2;
        
        // Calculate total gas fee in ETH
        const gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
          totalGasLimit.toString(),
          gasPriceWei
        ));
        
        // Get ETH price for USD conversion
        const ethWalletCurrency = await prisma.walletCurrency.findFirst({
          where: { currency: 'ETH', blockchain: 'ethereum' },
        });
        let ethPrice = new Decimal('0');
        if (ethWalletCurrency?.price) {
          ethPrice = new Decimal(ethWalletCurrency.price.toString());
        }
        
        const gasFeeUsd = gasFeeEth.mul(ethPrice);
        
        // Convert to fromCurrency for display
        const gasFee = gasFeeUsd.div(fromPrice);
        
        return { gasFee, gasFeeUsd, gasFeeEth };
      } catch (error: any) {
        console.error('[CRYPTO SWAP] Error calculating real gas fee, using fallback:', error);
        // Fall through to fallback calculation
      }
    } */
    
    // Fallback: Use fixed percentage (0.5% of the swap amount) or minimum fee
    const gasFeePercentage = new Decimal('0.005'); // 0.5%
    const minimumGasFeeUsd = new Decimal('5'); // Minimum $5 gas fee
    
    let gasFeeUsd = fromAmountUsd.mul(gasFeePercentage);
    if (gasFeeUsd.lessThan(minimumGasFeeUsd)) {
      gasFeeUsd = minimumGasFeeUsd;
    }

    // Convert gas fee USD to fromCurrency using the fromCurrency price
    const gasFee = gasFeeUsd.div(fromPrice);
    
    // For fallback, gasFeeEth is approximated
    const ethPrice = fromCurrency.toUpperCase() === 'ETH' ? fromPrice : new Decimal('2500'); // Approx ETH price
    const gasFeeEth = gasFeeUsd.div(ethPrice);

    return { gasFee, gasFeeUsd, gasFeeEth };
  }

  /**
   * Calculate swap quote
   */
  async calculateSwapQuote(input: SwapCryptoInput, fromAddress?: string, masterWalletAddress?: string): Promise<SwapQuoteResult> {
    const { fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = input;

    cryptoLogger.info('Calculating swap quote', {
      userId: input.userId,
      fromAmount,
      fromCurrency,
      fromBlockchain,
      toCurrency,
      toBlockchain,
      fromAddress,
      masterWalletAddress,
    });

    // Validate that both currency/blockchain combinations exist in wallet_currencies
    // Handle cases where currency might be stored as "USDT_TRON", "USDT_ETH", etc. instead of just "USDT"

    // Helper function to find wallet currency with flexible matching logic
    const findWalletCurrency = async (currency: string, blockchain: string) => {
      const currencyUpper = currency.toUpperCase();
      const blockchainLower = blockchain.toLowerCase();
      
      // First try exact match
      let walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          currency: currencyUpper,
          blockchain: blockchainLower,
        },
      });

      // If not found, try to find currency that contains the base currency (e.g., "USDT" → "USDT_TRON", "USDT_ETH", etc.)
      // This works for any currency, not just USDT
      if (!walletCurrency) {
        const allCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: blockchainLower,
            currency: {
              contains: currencyUpper, // Currency contains the requested currency (e.g., "USDT" matches "USDT_TRON")
            },
          },
        });
        
        // Prefer exact match, then any match on the blockchain
        walletCurrency = allCurrencies.find(c => c.currency === currencyUpper) || allCurrencies[0];
      }

      return walletCurrency;
    };

    // Step 1: Validate both currencies exist
    const fromWalletCurrency = await findWalletCurrency(fromCurrency, fromBlockchain);
    const toWalletCurrency = await findWalletCurrency(toCurrency, toBlockchain);

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

    // Step 5: Calculate gas fee (with real estimation if addresses provided)
    cryptoLogger.info('Calculating gas fee for swap', {
      fromAmountUsd: fromAmountUsd.toString(),
      fromCurrency,
      fromBlockchain,
      fromPrice: fromPrice.toString(),
      hasFromAddress: !!fromAddress,
      hasMasterWalletAddress: !!masterWalletAddress,
    });

    const { gasFee, gasFeeUsd, gasFeeEth } = await this.calculateGasFee(
      fromAmountUsd, 
      fromCurrency, 
      fromBlockchain, 
      fromPrice,
      fromAddress,
      masterWalletAddress,
      fromAmountDecimal
    );

    cryptoLogger.gasEstimate({
      gasFee: gasFee.toString(),
      gasFeeUsd: gasFeeUsd.toString(),
      gasFeeEth: gasFeeEth.toString(),
      fromCurrency,
      toCurrency,
    });

    // Step 6: Calculate total (fromAmount + gasFee)
    const totalAmount = fromAmountDecimal.plus(gasFee);
    const totalAmountUsd = fromAmountUsd.plus(gasFeeUsd);

    const quoteResult = {
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

    cryptoLogger.info('Swap quote calculated', {
      fromAmount: quoteResult.fromAmount,
      toAmount: quoteResult.toAmount,
      fromAmountUsd: quoteResult.fromAmountUsd,
      toAmountUsd: quoteResult.toAmountUsd,
      gasFee: quoteResult.gasFee,
      gasFeeUsd: quoteResult.gasFeeUsd,
      totalAmount: quoteResult.totalAmount,
      totalAmountUsd: quoteResult.totalAmountUsd,
      rateFromToUsd: quoteResult.rateFromToUsd,
      rateToToUsd: quoteResult.rateToToUsd,
    });

    return quoteResult;
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

    const filteredAccounts = virtualAccounts.filter((account) => {
      if ((account.currency || '').toUpperCase() !== 'USDC') return true;
      const blockchain = (account.blockchain || '').toLowerCase();
      const blockchainName = (account.walletCurrency?.blockchainName || '').toLowerCase();
      return (
        blockchain === 'ethereum' ||
        blockchain === 'eth' ||
        blockchain === 'erc20' ||
        blockchainName.includes('erc-20') ||
        blockchainName.includes('erc20') ||
        blockchainName.includes('ethereum')
      );
    });

    return filteredAccounts.map((account) => ({
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
    cryptoLogger.info('Starting swap transaction preview', {
      userId: input.userId,
      fromAmount: input.fromAmount,
      fromCurrency: input.fromCurrency,
      fromBlockchain: input.fromBlockchain,
      toCurrency: input.toCurrency,
      toBlockchain: input.toBlockchain,
    });

    // Validate that both currency/blockchain combinations exist in wallet_currencies
    // Handle cases where currency might be stored as "USDT_TRON", "USDT_ETH", etc. instead of just "USDT"

    // Helper function to find wallet currency with flexible matching logic
    const findWalletCurrency = async (currency: string, blockchain: string) => {
      const currencyUpper = currency.toUpperCase();
      const blockchainLower = blockchain.toLowerCase();
      
      // First try exact match
      let walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          currency: currencyUpper,
          blockchain: blockchainLower,
        },
      });

      // If not found, try to find currency that contains the base currency
      if (!walletCurrency) {
        const allCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: blockchainLower,
            currency: {
              contains: currencyUpper,
            },
          },
        });
        
        walletCurrency = allCurrencies.find(c => c.currency === currencyUpper) || allCurrencies[0];
      }

      return walletCurrency;
    };

    const fromWalletCurrency = await findWalletCurrency(input.fromCurrency, input.fromBlockchain);
    const toWalletCurrency = await findWalletCurrency(input.toCurrency, input.toBlockchain);

    if (!fromWalletCurrency) {
      throw new Error(`Currency ${input.fromCurrency} on ${input.fromBlockchain} is not supported`);
    }
    if (!toWalletCurrency) {
      throw new Error(`Currency ${input.toCurrency} on ${input.toBlockchain} is not supported`);
    }

    // Get user's virtual accounts with deposit addresses using the matched currency values
    const fromVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: input.userId,
        currency: fromWalletCurrency.currency, // Use the actual currency from wallet_currencies
        blockchain: input.fromBlockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        walletCurrency: true,
      },
    });

    const toVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: input.userId,
        currency: toWalletCurrency.currency, // Use the actual currency from wallet_currencies
        blockchain: input.toBlockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        walletCurrency: true,
      },
    });

    if (!fromVirtualAccount) {
      throw new Error(`Virtual account not found for ${input.fromCurrency} on ${input.fromBlockchain}`);
    }
    if (!toVirtualAccount) {
      throw new Error(`Virtual account not found for ${input.toCurrency} on ${input.toBlockchain}`);
    }

    const fromDepositAddress = fromVirtualAccount.depositAddresses[0]?.address;
    if (!fromDepositAddress) {
      throw new Error(`Deposit address not found for ${input.fromCurrency} on ${input.fromBlockchain}`);
    }

    // Get master wallet address
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain: 'ethereum' },
    });
    if (!masterWallet || !masterWallet.address) {
      throw new Error('Master wallet not found for Ethereum');
    }

    // Calculate quote with addresses for real gas estimation
    const quote = await this.calculateSwapQuote(input, fromDepositAddress, masterWallet.address);

    const fromBalanceBefore = new Decimal(fromVirtualAccount.availableBalance || '0');
    const toBalanceBefore = new Decimal(toVirtualAccount.availableBalance || '0');
    const totalAmountDecimal = new Decimal(quote.totalAmount);
    const toAmountDecimal = new Decimal(quote.toAmount);

    // Check if user has sufficient balance (including gas fee)
    const hasSufficientBalance = fromBalanceBefore.gte(totalAmountDecimal);

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated values only
    // For USDT → ETH swaps: Check if user has enough ETH for gas - COMMENTED OUT
    let hasSufficientEth = true;
    let userEthBalance = new Decimal('0');
    /* if (input.fromCurrency.toUpperCase() === 'USDT') {
      cryptoLogger.info('Checking ETH balance for USDT swap (gas fee check)', {
        userId: input.userId,
        depositAddress: fromDepositAddress,
      });

      const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
      try {
        const userEthBalanceStr = await ethereumBalanceService.getETHBalance(fromDepositAddress, false);
        userEthBalance = new Decimal(userEthBalanceStr);
        
        cryptoLogger.balanceCheck(fromDepositAddress, userEthBalance.toString(), 'ETH', {
          operation: 'swap_preview_gas_check',
        });
        
        // Extract gasFeeEth from quote (need to recalculate it)
        const { gasFeeEth } = await this.calculateGasFee(
          new Decimal(quote.fromAmountUsd),
          input.fromCurrency,
          input.fromBlockchain,
          new Decimal(quote.rateFromToUsd),
          fromDepositAddress,
          masterWallet.address,
          new Decimal(quote.fromAmount)
        );
        
        const bufferAmount = Decimal.max(
          gasFeeEth.mul(new Decimal('0.5')),
          new Decimal('0.0001')
        );
        const minimumEthNeeded = gasFeeEth.plus(bufferAmount);
        hasSufficientEth = userEthBalance.gte(minimumEthNeeded);

        cryptoLogger.info('ETH balance check for USDT swap', {
          userEthBalance: userEthBalance.toString(),
          gasFeeEth: gasFeeEth.toString(),
          minimumEthNeeded: minimumEthNeeded.toString(),
          hasSufficientEth,
        });
      } catch (error: any) {
        cryptoLogger.error('Error checking ETH balance for USDT swap', error, {
          userId: input.userId,
          depositAddress: fromDepositAddress,
        });
        hasSufficientEth = false;
      }
    } */

    const fromBalanceAfter = hasSufficientBalance
      ? fromBalanceBefore.minus(totalAmountDecimal)
      : fromBalanceBefore;
    const toBalanceAfter = hasSufficientBalance
      ? toBalanceBefore.plus(toAmountDecimal)
      : toBalanceBefore;

    const previewResult = {
      ...quote,
      fromBalanceBefore: fromBalanceBefore.toString(),
      toBalanceBefore: toBalanceBefore.toString(),
      fromBalanceAfter: fromBalanceAfter.toString(),
      toBalanceAfter: toBalanceAfter.toString(),
      userEthBalance: userEthBalance.toString(),
      hasSufficientEth,
      hasSufficientBalance,
      canProceed: hasSufficientBalance && hasSufficientEth,
      fromVirtualAccountId: fromVirtualAccount.id,
      toVirtualAccountId: toVirtualAccount.id,
    };

    cryptoLogger.info('Swap preview completed', {
      userId: input.userId,
      fromAmount: previewResult.fromAmount,
      toAmount: previewResult.toAmount,
      fromBalanceBefore: previewResult.fromBalanceBefore,
      toBalanceBefore: previewResult.toBalanceBefore,
      fromBalanceAfter: previewResult.fromBalanceAfter,
      toBalanceAfter: previewResult.toBalanceAfter,
      hasSufficientBalance: previewResult.hasSufficientBalance,
      hasSufficientEth: previewResult.hasSufficientEth,
      canProceed: previewResult.canProceed,
    });

    return previewResult;
  }

  /**
   * Execute swap transaction
   * 
   * Execute swap transaction (internal ledger operations)
   * 1. Validate currencies exist in wallet_currencies
   * 2. Check user has sufficient balance
   * 3. Update balances atomically
   * 4. Create transaction record
   */
  async swapCrypto(input: SwapCryptoInput): Promise<SwapCryptoResult> {
    const { userId, fromAmount, fromCurrency, fromBlockchain, toCurrency, toBlockchain } = input;

    console.log('\n========================================');
    console.log('[CRYPTO SWAP] Starting swap transaction');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('From:', fromAmount, fromCurrency, fromBlockchain);
    console.log('To:', toCurrency, toBlockchain);
    console.log('========================================\n');

    // Validate that both currency/blockchain combinations exist in wallet_currencies
    // First find the wallet currencies to get the actual currency values
    const findWalletCurrency = async (currency: string, blockchain: string) => {
      const currencyUpper = currency.toUpperCase();
      const blockchainLower = blockchain.toLowerCase();
      
      // First try exact match
      let walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          currency: currencyUpper,
          blockchain: blockchainLower,
        },
      });

      // If not found, try to find currency that contains the base currency
      if (!walletCurrency) {
        const allCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: blockchainLower,
            currency: {
              contains: currencyUpper,
            },
          },
        });
        
        walletCurrency = allCurrencies.find(c => c.currency === currencyUpper) || allCurrencies[0];
      }

      return walletCurrency;
    };

    const fromWalletCurrency = await findWalletCurrency(fromCurrency, fromBlockchain);
    const toWalletCurrency = await findWalletCurrency(toCurrency, toBlockchain);

    if (!fromWalletCurrency) {
      throw new Error(`Currency ${fromCurrency} on ${fromBlockchain} is not supported`);
    }
    if (!toWalletCurrency) {
      throw new Error(`Currency ${toCurrency} on ${toBlockchain} is not supported`);
    }

    // Get virtual accounts with deposit addresses using the matched currency values
    const fromVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: fromWalletCurrency.currency, // Use the actual currency from wallet_currencies
        blockchain: fromBlockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const toVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: toWalletCurrency.currency, // Use the actual currency from wallet_currencies
        blockchain: toBlockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!fromVirtualAccount) {
      throw new Error(`Virtual account not found for ${fromCurrency} on ${fromBlockchain}`);
    }
    if (!toVirtualAccount) {
      throw new Error(`Virtual account not found for ${toCurrency} on ${toBlockchain}`);
    }

    const fromDepositAddress = fromVirtualAccount.depositAddresses[0]?.address;
    const toDepositAddress = toVirtualAccount.depositAddresses[0]?.address;
    if (!fromDepositAddress) {
      throw new Error(`Deposit address not found for ${fromCurrency} on ${fromBlockchain}`);
    }
    if (!toDepositAddress) {
      throw new Error(`Deposit address not found for ${toCurrency} on ${toBlockchain}`);
    }

    const fromDepositAddressRecord = fromVirtualAccount.depositAddresses[0];
    if (!fromDepositAddressRecord || !fromDepositAddressRecord.privateKey) {
      throw new Error('Deposit address private key not found');
    }

    // Get master wallet
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain: 'ethereum' },
    });
    if (!masterWallet || !masterWallet.address || !masterWallet.privateKey) {
      throw new Error('Master wallet not found or missing private key for Ethereum');
    }

    // Calculate quote with addresses
    const quote = await this.calculateSwapQuote(input, fromDepositAddress, masterWallet.address);
    const totalAmountDecimal = new Decimal(quote.totalAmount);
    
    // Round toAmount to 18 decimal places for Ethereum (to avoid "too many decimal places" error)
    // ETH and ERC-20 tokens use 18 decimals, so we need to round to 18 decimal places
    const toAmountDecimal = new Decimal(quote.toAmount).toDecimalPlaces(18);
    const fromAmountDecimal = new Decimal(quote.fromAmount);

    // Check balance
    const fromBalanceBefore = new Decimal(fromVirtualAccount.availableBalance || '0');
    if (fromBalanceBefore.lessThan(totalAmountDecimal)) {
      throw new Error(`Insufficient ${fromCurrency} balance. Required: ${totalAmountDecimal.toString()}, Available: ${fromBalanceBefore.toString()}`);
    }

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated transaction only
    // For USDT → ETH swaps: Check if user has enough ETH for gas - COMMENTED OUT
    /* if (fromCurrency.toUpperCase() === 'USDT') {
      const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
      const userEthBalanceStr = await ethereumBalanceService.getETHBalance(fromDepositAddress, false);
      const userEthBalance = new Decimal(userEthBalanceStr);
      
      const { gasFeeEth } = await this.calculateGasFee(
        new Decimal(quote.fromAmountUsd),
        fromCurrency,
        fromBlockchain,
        new Decimal(quote.rateFromToUsd),
        fromDepositAddress,
        masterWallet.address,
        fromAmountDecimal
      );
      
      const bufferAmount = Decimal.max(
        gasFeeEth.mul(new Decimal('0.5')),
        new Decimal('0.0001')
      );
      const minimumEthNeeded = gasFeeEth.plus(bufferAmount);
      
      if (userEthBalance.lessThan(minimumEthNeeded)) {
        throw new Error(`Insufficient ETH for gas fees. You need at least ${minimumEthNeeded.toString()} ETH to swap USDT, but you only have ${userEthBalance.toString()} ETH. Please buy some ETH first.`);
      }
    } */

    // Generate simulated transaction hashes
    const crypto = require('crypto');
    const userToMasterTxHash = '0x' + crypto.randomBytes(32).toString('hex');
    const masterToUserTxHash = '0x' + crypto.randomBytes(32).toString('hex');

    cryptoLogger.info('Simulated swap transaction', {
      userId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      fromAmount: fromAmountDecimal.toString(),
      simulatedUserToMasterTxHash: userToMasterTxHash,
      simulatedMasterToUserTxHash: masterToUserTxHash,
      note: 'Blockchain calls commented out - using simulated transaction hashes',
    });

    // COMMENTED OUT: Real blockchain transfer code
    // Decrypt private keys (commented out)
    /*
    function decryptPrivateKey(encryptedKey: string): string {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
      const parts = encryptedKey.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      // @ts-ignore
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    /* let userPrivateKey = decryptPrivateKey(fromDepositAddressRecord.privateKey);
    userPrivateKey = userPrivateKey.trim();
    if (userPrivateKey.startsWith('0x')) {
      userPrivateKey = userPrivateKey.substring(2).trim();
    }
    if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
      throw new Error('Invalid user private key format');
    }

    let masterPrivateKey = decryptPrivateKey(masterWallet.privateKey);
    masterPrivateKey = masterPrivateKey.trim();
    if (masterPrivateKey.startsWith('0x')) {
      masterPrivateKey = masterPrivateKey.substring(2).trim();
    }
    if (masterPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(masterPrivateKey)) {
      throw new Error('Invalid master private key format');
    }

    // Import services
    const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');
    const { ethereumTransactionService } = await import('../ethereum/ethereum.transaction.service');

    // Execute blockchain transfers
    let userToMasterTxHash: string | null = null;
    let masterToUserTxHash: string | null = null;

    try {
      // Step 1: User sends fromCurrency to master wallet
      console.log(`[CRYPTO SWAP] Transferring ${fromCurrency} from user to master wallet`);
      
      // Round fromAmount to 18 decimal places for Ethereum transactions
      const fromAmountRounded = fromAmountDecimal.toDecimalPlaces(18);
      
      const userToMasterGas = await ethereumGasService.estimateGasFee(
        fromDepositAddress,
        masterWallet.address,
        fromAmountRounded.toString(),
        false
      );
      
      let gasLimit1 = parseInt(userToMasterGas.gasLimit);
      if (fromCurrency.toUpperCase() === 'USDT') {
        gasLimit1 = Math.max(gasLimit1, 65000);
        gasLimit1 = Math.ceil(gasLimit1 * 1.2);
      } else {
        gasLimit1 = Math.ceil(gasLimit1 * 1.1);
      }

      userToMasterTxHash = await ethereumTransactionService.sendTransaction(
        masterWallet.address,
        fromAmountRounded.toString(),
        fromCurrency.toUpperCase(),
        userPrivateKey,
        ethereumGasService.weiToGwei(userToMasterGas.gasPrice),
        gasLimit1.toString(),
        false
      );

      console.log(`[CRYPTO SWAP] User → Master transfer successful: ${userToMasterTxHash}`);

      // Step 2: Master sends toCurrency to user
      console.log(`[CRYPTO SWAP] Transferring ${toCurrency} from master to user wallet`);
      
      // toAmountDecimal is already rounded to 18 decimal places above
      const masterToUserGas = await ethereumGasService.estimateGasFee(
        masterWallet.address,
        toDepositAddress,
        toAmountDecimal.toString(),
        false
      );
      
      let gasLimit2 = parseInt(masterToUserGas.gasLimit);
      if (toCurrency.toUpperCase() === 'USDT') {
        gasLimit2 = Math.max(gasLimit2, 65000);
        gasLimit2 = Math.ceil(gasLimit2 * 1.2);
      } else {
        gasLimit2 = Math.ceil(gasLimit2 * 1.1);
      }

      masterToUserTxHash = await ethereumTransactionService.sendTransaction(
        toDepositAddress,
        toAmountDecimal.toString(),
        toCurrency.toUpperCase(),
        masterPrivateKey,
        ethereumGasService.weiToGwei(masterToUserGas.gasPrice),
        gasLimit2.toString(),
        false
      );

      console.log(`[CRYPTO SWAP] Master → User transfer successful: ${masterToUserTxHash}`);
    } catch (error: any) {
      console.error('[CRYPTO SWAP] Blockchain transfer failed:', error);
      cryptoLogger.exception('Blockchain swap failed', error, {
        userId,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromAmount: fromAmountDecimal.toString(),
        userToMasterTxHash,
        masterToUserTxHash,
        note: 'Blockchain swap failed - virtual accounts not updated.',
      });
      throw new Error(`Failed to execute swap: ${error.message || 'Unknown error'}`);
    } */

    const toBalanceBefore = new Decimal(toVirtualAccount.availableBalance || '0');
    const fromBalanceAfter = fromBalanceBefore.minus(totalAmountDecimal);
    const toBalanceAfter = toBalanceBefore.plus(toAmountDecimal);

    // Generate transaction ID
    const transactionId = `SWAP-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;

    // Update balances and create transaction record
    return await prisma.$transaction(async (tx) => {
      // Debit fromCurrency
      await tx.virtualAccount.update({
        where: { id: fromVirtualAccount.id },
        data: {
          availableBalance: fromBalanceAfter.toString(),
          accountBalance: fromBalanceAfter.toString(),
        },
      });

      // Credit toCurrency
      await tx.virtualAccount.update({
        where: { id: toVirtualAccount.id },
        data: {
          availableBalance: toBalanceAfter.toString(),
          accountBalance: toBalanceAfter.toString(),
        },
      });

      // Create transaction record
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
              fromAddress: fromDepositAddress,
              toAddress: toDepositAddress,
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
              txHash: userToMasterTxHash, // Store simulated user→master transaction hash (first transaction)
            },
          },
        },
      });

      console.log('[CRYPTO SWAP] Transaction completed successfully:', {
        transactionId,
        userToMasterTxHash,
        masterToUserTxHash,
        fromBalanceBefore: fromBalanceBefore.toString(),
        fromBalanceAfter: fromBalanceAfter.toString(),
        toBalanceBefore: toBalanceBefore.toString(),
        toBalanceAfter: toBalanceAfter.toString(),
      });

      // Send notifications
      try {
        await sendPushNotification({
          userId,
          title: 'Crypto Swap Successful',
          body: `You successfully swapped ${quote.fromAmount} ${quote.fromCurrency} for ${quote.toAmount} ${quote.toCurrency}`,
          sound: 'default',
          priority: 'high',
        });

        await tx.inAppNotification.create({
          data: {
            userId,
            title: 'Crypto Swap Successful',
            description: `You successfully swapped ${quote.fromAmount} ${quote.fromCurrency} for ${quote.toAmount} ${quote.toCurrency}. Transaction ID: ${transactionId}`,
            type: InAppNotificationType.customeer,
          },
        });

        cryptoLogger.info('Swap transaction notification sent', { userId, transactionId });
      } catch (notifError: any) {
        cryptoLogger.exception('Send swap notification', notifError, { userId, transactionId });
        // Don't fail the transaction if notification fails
      }

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
      maxWait: 10000,
      timeout: 30000, // Increased timeout for blockchain operations
    });
  }
}

export default new CryptoSwapService();

