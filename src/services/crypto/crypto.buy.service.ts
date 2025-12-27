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
import cryptoLogger from '../../utils/crypto.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

export interface BuyCryptoInput {
  userId: number;
  amount: number; // Amount in crypto currency (e.g., 15 USDT, 0.001 BTC)
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
   * 1. Validate crypto currency exists and get price
   * 2. Calculate USD value of crypto amount
   * 3. Get USD to NGN rate from crypto_rates table (BUY transaction type)
   * 4. Calculate NGN cost
   * 5. Validate user has sufficient fiat balance
   * 6. Debit fiat wallet (NGN)
   * 7. Credit virtual account (crypto)
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
    const { userId, amount, currency, blockchain } = input;

    // Only Ethereum blockchain is currently supported for real blockchain transactions
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto buy for ${blockchain} blockchain is not active yet. Only Ethereum (ETH and USDT) is currently supported.`);
    }

    // Only ETH and USDT are currently supported
    if (currency.toUpperCase() !== 'ETH' && currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto buy for ${currency} on ${blockchain} is not active yet. Only ETH and USDT on Ethereum are currently supported.`);
    }

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

    // Get crypto price
    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    
    // Calculate USD value of crypto amount
    const amountCryptoDecimal = new Decimal(amount);
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // Get USD to NGN rate (outside transaction)
    const estimatedUsdAmount = parseFloat(amountUsd.toString());
    const usdToNgnRate = await cryptoRateService.getRateForAmount('BUY', estimatedUsdAmount);
    
    if (!usdToNgnRate) {
      throw new Error('No rate found for BUY transaction. Please contact support.');
    }

    // Calculate NGN cost
    const amountNgn = amountUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

    // Get user's fiat wallet (outside transaction)
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    
    // Check sufficient balance
    const balanceBefore = new Decimal(fiatWallet.balance);
    
    if (balanceBefore.lessThan(amountNgn)) {
      throw new Error('Insufficient fiat balance');
    }

    // Get virtual account with deposit address (outside transaction)
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain}. Please contact support.`);
    }

    // Get deposit address for blockchain transfers
    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;

    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
    const cryptoBalanceAfter = cryptoBalanceBefore.plus(amountCryptoDecimal);

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated transaction only
    // Check Master Wallet Balance before processing (for Ethereum and USDT only)
    /* if (blockchain.toLowerCase() === 'ethereum' && (currency.toUpperCase() === 'ETH' || currency.toUpperCase() === 'USDT')) {
      try {
        console.log('Checking master wallet balance for Ethereum and USDT');
        // Get master wallet for Ethereum
        const masterWallet = await prisma.masterWallet.findUnique({
          where: { blockchain: 'ethereum' },
        });

        if (!masterWallet || !masterWallet.address) {
          throw new Error('Master wallet not found for Ethereum. Please contact support.');
        }

        // Import balance service
        const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
        
        let masterBalance: string;
        if (currency.toUpperCase() === 'ETH') {
          // Check ETH balance
          masterBalance = await ethereumBalanceService.getETHBalance(masterWallet.address, false);
        } else {
          // Check USDT balance (ERC-20 token) - use contract address from walletCurrency
          const contractAddress = walletCurrency.contractAddress;
          if (!contractAddress) {
            throw new Error(`${currency} contract address not configured in wallet_currencies table. Please contact support.`);
          }
          
          // Use decimals from walletCurrency (USDT uses 6, most ERC-20 use 18)
          const tokenDecimals = walletCurrency.decimals || 6;
          
          masterBalance = await ethereumBalanceService.getERC20Balance(
            contractAddress,
            masterWallet.address,
            tokenDecimals,
            false // mainnet
          );
        }

        const masterBalanceDecimal = new Decimal(masterBalance);
        const requiredBalance = amountCryptoDecimal;

        // Check if master wallet has sufficient balance
        if (masterBalanceDecimal.lessThan(requiredBalance)) {
          throw new Error(
            `Insufficient master wallet balance. Available: ${masterBalance} ${currency}, Required: ${requiredBalance.toString()} ${currency}`
          );
        }

        console.log(`Master wallet balance check passed: ${masterBalance} ${currency} available, ${requiredBalance.toString()} ${currency} required`);
      } catch (error: any) {
        console.error('Master wallet balance check failed:', error);
        // Re-throw the error to prevent transaction processing
        throw error;
      }
    } */

    // Step 8: Execute blockchain transfer FIRST (for Ethereum only) - COMMENTED OUT
    // This must succeed before we debit fiat wallet and credit virtual account
    // SIMULATED TRANSACTION: Generate fake txHash and gas fee values
    let txHash: string | null = null;
    let gasFeeEth: Decimal = new Decimal('0');
    let gasFeeUsd: Decimal = new Decimal('0');
    let gasFeeNgn: Decimal = new Decimal('0');
    let gasLimit: string | null = null;
    let gasPriceGwei: string | null = null;
    let masterWalletAddress: string | null = null;

    // Generate simulated txHash for database
    if (blockchain.toLowerCase() === 'ethereum' && (currency.toUpperCase() === 'ETH' || currency.toUpperCase() === 'USDT')) {
      // Generate simulated transaction hash
      const crypto = require('crypto');
      const simulatedHash = '0x' + crypto.randomBytes(32).toString('hex');
      txHash = simulatedHash;
      
      // Set simulated gas fee values
      gasFeeEth = new Decimal('0.001'); // Simulated 0.001 ETH gas fee
      const ethWalletCurrency = await prisma.walletCurrency.findFirst({
        where: { currency: 'ETH', blockchain: 'ethereum' },
      });
      const ethPrice = ethWalletCurrency?.price ? new Decimal(ethWalletCurrency.price.toString()) : new Decimal('2500');
      gasFeeUsd = gasFeeEth.mul(ethPrice);
      gasFeeNgn = gasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));
      
      // Simulated gas parameters
      gasLimit = currency.toUpperCase() === 'ETH' ? '21000' : '65000';
      gasPriceGwei = '30';
      
      // Get master wallet address for database record
      const masterWallet = await prisma.masterWallet.findUnique({
        where: { blockchain: 'ethereum' },
      });
      masterWalletAddress = masterWallet?.address || null;

      cryptoLogger.info('Simulated blockchain transaction', {
        userId,
        currency: currency.toUpperCase(),
        amount: amountCryptoDecimal.toString(),
        simulatedTxHash: txHash,
        note: 'Blockchain calls commented out - using simulated transaction hash',
      });
    }

    // COMMENTED OUT: Real blockchain transfer code
    /* if (blockchain.toLowerCase() === 'ethereum' && (currency.toUpperCase() === 'ETH' || currency.toUpperCase() === 'USDT')) {
      // Import services
      const { ethereumTransactionService } = await import('../ethereum/ethereum.transaction.service');
      const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

      // Get master wallet with private key
      const masterWallet = await prisma.masterWallet.findUnique({
        where: { blockchain: 'ethereum' },
      });

      if (!masterWallet || !masterWallet.address || !masterWallet.privateKey) {
        throw new Error('Master wallet not found or missing private key for Ethereum');
      }

      if (!depositAddress) {
        throw new Error('Deposit address not found for virtual account. Please contact support.');
      }

      masterWalletAddress = masterWallet.address;

      // Decrypt private key before use
      const crypto = require('crypto');
      function decryptPrivateKey(encryptedKey: string): string {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
        const parts = encryptedKey.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }

      let decryptedPrivateKey = decryptPrivateKey(masterWallet.privateKey);
      
      // Clean and validate private key
      decryptedPrivateKey = decryptedPrivateKey.trim();
      
      // Remove 0x prefix if present (Tatum accepts both formats, but 64 chars without 0x is standard)
      const hasPrefix = decryptedPrivateKey.startsWith('0x');
      if (hasPrefix) {
        decryptedPrivateKey = decryptedPrivateKey.substring(2).trim();
      }
      
      // Validate private key length (Ethereum private keys are 64 hex characters without 0x)
      if (decryptedPrivateKey.length !== 64) {
        cryptoLogger.exception('Invalid private key length', new Error(`Private key length: ${decryptedPrivateKey.length}`), {
          expectedLength: 64,
          actualLength: decryptedPrivateKey.length,
          hasPrefix: hasPrefix,
          keyPreview: decryptedPrivateKey.substring(0, 10) + '...',
        });
        throw new Error(`Invalid private key format. Expected 64 hex characters, got ${decryptedPrivateKey.length}`);
      }
      
      // Validate it's valid hex
      if (!/^[0-9a-fA-F]{64}$/.test(decryptedPrivateKey)) {
        throw new Error('Invalid private key format. Must be 64 hexadecimal characters (0-9, a-f, A-F)');
      }

      // Estimate gas fee
      const gasEstimateResult = await ethereumGasService.estimateGasFee(
        masterWallet.address,
        depositAddress,
        amountCryptoDecimal.toString(),
        false // mainnet
      );

      // For ERC-20 token transfers, we need higher gas limit than ETH transfers
      // ETH transfers: ~21,000 gas
      // ERC-20 transfers: ~65,000-100,000 gas (depending on token)
      let estimatedGasLimit = parseInt(gasEstimateResult.gasLimit);
      
      if (currency.toUpperCase() !== 'ETH') {
        // For ERC-20 tokens, use a safer gas limit
        // Tatum's estimation might be for ETH transfers, so use standard ERC-20 limit
        const erc20GasLimit = 65000; // Standard ERC-20 transfer gas limit
        // Use the higher of estimated or standard ERC-20 limit, with 20% buffer for safety
        estimatedGasLimit = Math.max(estimatedGasLimit, erc20GasLimit);
        estimatedGasLimit = Math.ceil(estimatedGasLimit * 1.2); // Add 20% buffer
      } else {
        // For ETH transfers, add 10% buffer
        estimatedGasLimit = Math.ceil(estimatedGasLimit * 1.1);
      }
      
      gasLimit = estimatedGasLimit.toString();
      const gasPriceWei = gasEstimateResult.gasPrice;
      gasPriceGwei = ethereumGasService.weiToGwei(gasPriceWei);

      // Calculate gas fee
      gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(gasLimit, gasPriceWei));

      // Convert gas fee to USD and NGN for logging
      let ethPrice = new Decimal('0');
      if (currency.toUpperCase() === 'ETH') {
        ethPrice = cryptoPrice;
      } else {
        const ethWalletCurrency = await prisma.walletCurrency.findFirst({
          where: { currency: 'ETH', blockchain: 'ethereum' },
        });
        if (ethWalletCurrency?.price) {
          ethPrice = new Decimal(ethWalletCurrency.price.toString());
        }
      }
      
      gasFeeUsd = gasFeeEth.mul(ethPrice);
      gasFeeNgn = gasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));
      
      // Add minimum 10 NGN buffer to gas fee for safety
      const minGasFeeBuffer = new Decimal('10');
      if (gasFeeNgn.lessThan(minGasFeeBuffer)) {
        gasFeeNgn = minGasFeeBuffer;
        cryptoLogger.gasEstimate({
          note: 'Gas fee adjusted to minimum 10 NGN buffer',
          original: gasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString())).toString(),
          adjusted: gasFeeNgn.toString(),
        });
      } else {
        // Add 10 NGN buffer even if gas fee is already higher
        gasFeeNgn = gasFeeNgn.plus(minGasFeeBuffer);
      }

      cryptoLogger.gasEstimate({
        from: masterWallet.address,
        to: depositAddress,
        amount: amountCryptoDecimal.toString(),
        currency: currency.toUpperCase(),
        gasLimit,
        gasPriceGwei,
        gasFeeEth: gasFeeEth.toString(),
        gasFeeUsd: gasFeeUsd.toString(),
        gasFeeNgn: gasFeeNgn.toString(),
      });

      // Execute blockchain transfer - MUST SUCCEED before proceeding
      cryptoLogger.transfer('OUTGOING', {
        userId,
        transactionId: `BUY-${Date.now()}-${userId}`,
        from: masterWallet.address,
        to: depositAddress,
        amount: amountCryptoDecimal.toString(),
        currency: currency.toUpperCase(),
        gasLimit,
        gasPriceGwei,
      });

      try {
        txHash = await ethereumTransactionService.sendTransaction(
          depositAddress,
          amountCryptoDecimal.toString(),
          currency.toUpperCase(),
          decryptedPrivateKey,
          gasPriceGwei,
          gasLimit,
          false // mainnet
        );

        if (!txHash) {
          throw new Error('Blockchain transaction failed: No transaction hash returned');
        }

        cryptoLogger.transfer('OUTGOING_SUCCESS', {
          userId,
          txHash,
          amount: amountCryptoDecimal.toString(),
          currency: currency.toUpperCase(),
        });
      } catch (error: any) {
        cryptoLogger.exception('Blockchain transfer failed', error, {
          userId,
          currency,
          blockchain,
          amount: amountCryptoDecimal.toString(),
          note: 'Blockchain transfer failed - transaction aborted. No funds have been debited.',
        });
        // Throw error to abort the entire transaction
        throw new Error(`Failed to execute blockchain transfer: ${error.message || 'Unknown error'}`);
      }
    } */

    // Now execute the transaction with increased timeout
    // Only reaches here if blockchain transfer succeeded (for Ethereum) or if not Ethereum
    return await prisma.$transaction(async (tx) => {
      // Step 9: Debit fiat wallet (NGN)
      // Create fiat transaction first
      const fiatTransaction = await tx.fiatTransaction.create({
        data: {
          userId,
          walletId: fiatWallet.id,
          type: 'CRYPTO_BUY',
          status: 'pending',
          currency: 'NGN',
          amount: amountNgn,
          fees: new Decimal('0'),
          totalAmount: amountNgn,
          balanceBefore: balanceBefore,
          description: `Buy ${amountCryptoDecimal.toString()} ${currency}`,
        },
      });

      // Debit wallet
      const balanceAfter = balanceBefore.minus(amountNgn);
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

      // Step 10: Credit virtual account
      await tx.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: cryptoBalanceAfter.toString(),
          accountBalance: cryptoBalanceAfter.toString(),
        },
      });

      // Step 11: Create crypto transaction record with all rates and blockchain details
      const transactionId = `BUY-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const cryptoTransaction = await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId: virtualAccount.id,
          transactionType: 'BUY',
          transactionId,
          status: 'successful', // Transaction is successful once we get txHash from Tatum
          currency: virtualAccount.currency,
          blockchain: virtualAccount.blockchain,
          cryptoBuy: {
            create: {
              amount: amountCryptoDecimal,
              amountUsd: amountUsd,
              amountNaira: amountNgn,
              rate: cryptoPrice, // Legacy field
              rateNgnToUsd: new Decimal(usdToNgnRate.rate.toString()),
              rateUsdToCrypto: cryptoPrice,
              fromAddress: masterWalletAddress,
              toAddress: txHash ? depositAddress : null,
              txHash: txHash, // Store transaction hash in CryptoBuy model
            },
          },
        },
      });

      // Log all transaction details
      cryptoLogger.transaction('BUY_COMPLETE', {
        transactionId,
        userId,
        currency: currency.toUpperCase(),
        blockchain,
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNgn: amountNgn.toString(),
        rateUsdToCrypto: cryptoPrice.toString(),
        rateNgnToUsd: usdToNgnRate.rate.toString(),
        txHash,
        gasFee: txHash ? {
          eth: gasFeeEth.toString(),
          usd: gasFeeUsd.toString(),
          ngn: gasFeeNgn.toString(),
          gasLimit,
          gasPriceGwei,
        } : null,
        fiatWalletId: fiatWallet.id,
        virtualAccountId: virtualAccount.id,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        cryptoBalanceBefore: cryptoBalanceBefore.toString(),
        cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      });

      // Send notifications
      try {
        await sendPushNotification({
          userId,
          title: 'Crypto Purchase Successful',
          body: `You successfully purchased ${amountCryptoDecimal.toString()} ${currency.toUpperCase()} for NGN${amountNgn.toString()}`,
          sound: 'default',
          priority: 'high',
        });

        await tx.inAppNotification.create({
          data: {
            userId,
            title: 'Crypto Purchase Successful',
            description: `You successfully purchased ${amountCryptoDecimal.toString()} ${currency.toUpperCase()} for NGN${amountNgn.toString()}. Transaction ID: ${transactionId}`,
            type: InAppNotificationType.customeer,
          },
        });

        cryptoLogger.info('Buy transaction notification sent', { userId, transactionId });
      } catch (notifError: any) {
        cryptoLogger.exception('Send buy notification', notifError, { userId, transactionId });
        // Don't fail the transaction if notification fails
      }

      return {
        transactionId: cryptoTransaction.transactionId,
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNgn: amountNgn.toString(),
        rateUsdToCrypto: cryptoPrice.toString(),
        rateNgnToUsd: usdToNgnRate.rate.toString(),
        fiatWalletId: fiatWallet.id,
        virtualAccountId: virtualAccount.id,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        cryptoBalanceBefore: cryptoBalanceBefore.toString(),
        cryptoBalanceAfter: cryptoBalanceAfter.toString(),
        txHash: txHash,
        gasFee: txHash ? {
          eth: gasFeeEth.toString(),
          usd: gasFeeUsd.toString(),
          ngn: gasFeeNgn.toString(),
          gasLimit,
          gasPriceGwei,
        } : null,
      };
    }, {
      maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
      timeout: 15000, // Maximum time the transaction can run (15 seconds)
    });
  }

  /**
   * Calculate buy quote (preview before actual purchase)
   * Returns estimated NGN cost for a given crypto amount
   */
  async calculateBuyQuote(amountCrypto: number, currency: string, blockchain: string) {
    // Only Ethereum blockchain is currently supported for real blockchain transactions
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto buy for ${blockchain} blockchain is not active yet. Only Ethereum (ETH and USDT) is currently supported.`);
    }

    // Only ETH and USDT are currently supported
    if (currency.toUpperCase() !== 'ETH' && currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto buy for ${currency} on ${blockchain} is not active yet. Only ETH and USDT on Ethereum are currently supported.`);
    }

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
    
    // Calculate USD value
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // Get USD to NGN rate
    const estimatedUsdAmount = parseFloat(amountUsd.toString());
    const usdToNgnRate = await cryptoRateService.getRateForAmount('BUY', estimatedUsdAmount);
    
    if (!usdToNgnRate) {
      throw new Error('No rate found for BUY transaction');
    }

    // Calculate NGN cost
    const amountNgn = amountUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

    return {
      amountCrypto: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      amountNgn: amountNgn.toString(),
      rateUsdToCrypto: cryptoPrice.toString(),
      rateNgnToUsd: usdToNgnRate.rate.toString(),
      currency: currency.toUpperCase(),
      blockchain: blockchain.toLowerCase(),
      currencyName: walletCurrency.name,
      currencySymbol: walletCurrency.symbol,
    };
  }

  /**
   * Preview buy transaction with complete details (finalize step)
   * Includes current balances, rates, gas fees, and all transaction details
   */
  async previewBuyTransaction(userId: number, amountCrypto: number, currency: string, blockchain: string) {
    console.log('\n========================================');
    console.log('[CRYPTO BUY PREVIEW] Starting preview');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amountCrypto);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('========================================\n');

    // Only Ethereum blockchain is currently supported for real blockchain transactions
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto buy for ${blockchain} blockchain is not active yet. Only Ethereum (ETH and USDT) is currently supported.`);
    }

    // Only ETH and USDT are currently supported
    if (currency.toUpperCase() !== 'ETH' && currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto buy for ${currency} on ${blockchain} is not active yet. Only ETH and USDT on Ethereum are currently supported.`);
    }

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
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
    }

    // Get deposit address for blockchain transfers
    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;

    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');

    // Calculate quote
    const quote = await this.calculateBuyQuote(amountCrypto, currency, blockchain);
    const amountCryptoDecimal = new Decimal(amountCrypto);
    const amountNgnDecimal = new Decimal(quote.amountNgn);

    // Initialize gas fee variables (for Ethereum only) - SIMULATED
    let gasFeeEth = new Decimal('0');
    let gasFeeUsd = new Decimal('0');
    let gasFeeNgn = new Decimal('0');
    let totalAmountNgn = amountNgnDecimal;
    let masterWalletBalance: string | null = null;
    let hasSufficientMasterBalance = true;
    let gasEstimate: any = null;

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated gas fees only
    // For Ethereum blockchain: Check master wallet balance and calculate gas fees
    if (blockchain.toLowerCase() === 'ethereum' && (currency.toUpperCase() === 'ETH' || currency.toUpperCase() === 'USDT')) {
      // Simulated gas fee values
      gasFeeEth = new Decimal('0.001'); // Simulated 0.001 ETH
      const ethWalletCurrency = await prisma.walletCurrency.findFirst({
        where: { currency: 'ETH', blockchain: 'ethereum' },
      });
      const ethPrice = ethWalletCurrency?.price ? new Decimal(ethWalletCurrency.price.toString()) : new Decimal('2500');
      gasFeeUsd = gasFeeEth.mul(ethPrice);
      const quoteUsdToNgnRate = parseFloat(quote.rateNgnToUsd);
      if (quoteUsdToNgnRate > 0) {
        gasFeeNgn = gasFeeUsd.mul(new Decimal(quoteUsdToNgnRate.toString()));
      }
      totalAmountNgn = amountNgnDecimal.plus(gasFeeNgn);
      
      gasEstimate = {
        gasLimit: currency.toUpperCase() === 'ETH' ? '21000' : '65000',
        gasPrice: { wei: '30000000000', gwei: '30' },
      };
      
      hasSufficientMasterBalance = true;
    }

    // COMMENTED OUT: Real blockchain gas fee calculation
    /* if (blockchain.toLowerCase() === 'ethereum' && (currency.toUpperCase() === 'ETH' || currency.toUpperCase() === 'USDT')) {
      console.log('[CRYPTO BUY PREVIEW] Entering Ethereum gas fee calculation block');
      try {
        // Import services
        const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
        const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

        // Get master wallet
        const masterWallet = await prisma.masterWallet.findUnique({
          where: { blockchain: 'ethereum' },
        });

        console.log('[CRYPTO BUY PREVIEW] Master wallet check:', {
          masterWalletFound: !!masterWallet,
          masterWalletAddress: masterWallet?.address || 'null',
          depositAddress: depositAddress || 'null',
        });

        if (masterWallet && masterWallet.address && depositAddress) {
          console.log('[CRYPTO BUY PREVIEW] Checking master wallet balance');
          console.log('Master wallet address:', masterWallet.address);
          console.log('Deposit address:', depositAddress);
          console.log('Required amount:', amountCryptoDecimal.toString(), currency);

          // Check master wallet balance
          if (currency.toUpperCase() === 'ETH') {
            masterWalletBalance = await ethereumBalanceService.getETHBalance(masterWallet.address, false);
            console.log('[CRYPTO BUY PREVIEW] Master wallet ETH balance:', masterWalletBalance);
          } else {
            // USDT
            const contractAddress = walletCurrency.contractAddress;
            if (contractAddress) {
              console.log('[CRYPTO BUY PREVIEW] Checking USDT balance (contract:', contractAddress + ')');
              masterWalletBalance = await ethereumBalanceService.getERC20Balance(
                contractAddress,
                masterWallet.address,
                walletCurrency.decimals || 6,
                false
              );
              console.log('[CRYPTO BUY PREVIEW] Master wallet USDT balance:', masterWalletBalance);
            }
          }

          // Check if master wallet has sufficient balance
          if (masterWalletBalance) {
            const masterBalanceDecimal = new Decimal(masterWalletBalance);
            hasSufficientMasterBalance = masterBalanceDecimal.gte(amountCryptoDecimal);
            console.log('[CRYPTO BUY PREVIEW] Master wallet has sufficient balance:', hasSufficientMasterBalance);
            if (!hasSufficientMasterBalance) {
              console.log('[CRYPTO BUY PREVIEW] WARNING: Master wallet balance insufficient!');
              console.log('  Available:', masterWalletBalance, currency);
              console.log('  Required:', amountCryptoDecimal.toString(), currency);
            }
          }

          // Estimate gas fee
          console.log('[CRYPTO BUY PREVIEW] Estimating gas fee');
          const gasPrice = await ethereumGasService.getGasPrice(false);
          console.log('[CRYPTO BUY PREVIEW] Current gas price:', gasPrice.gwei, 'Gwei');
          
          const gasEstimateResult = await ethereumGasService.estimateGasFee(
            masterWallet.address,
            depositAddress,
            amountCryptoDecimal.toString(),
            false
          );
          console.log('[CRYPTO BUY PREVIEW] Initial gas estimate:', {
            gasLimit: gasEstimateResult.gasLimit,
            gasPrice: ethereumGasService.weiToGwei(gasEstimateResult.gasPrice) + ' Gwei',
          });

          // For ERC-20 token transfers, we need higher gas limit than ETH transfers
          // ETH transfers: ~21,000 gas
          // ERC-20 transfers: ~65,000-100,000 gas (depending on token)
          let estimatedGasLimit = parseInt(gasEstimateResult.gasLimit);
          
          if (currency.toUpperCase() !== 'ETH') {
            // For ERC-20 tokens, use a safer gas limit
            // Tatum's estimation might be for ETH transfers, so use standard ERC-20 limit
            const erc20GasLimit = 65000; // Standard ERC-20 transfer gas limit
            // Use the higher of estimated or standard ERC-20 limit, with 20% buffer for safety
            estimatedGasLimit = Math.max(estimatedGasLimit, erc20GasLimit);
            console.log('[CRYPTO BUY PREVIEW] ERC-20 token detected - applying minimum gas limit:', erc20GasLimit);
            estimatedGasLimit = Math.ceil(estimatedGasLimit * 1.2); // Add 20% buffer
            console.log('[CRYPTO BUY PREVIEW] Adjusted gas limit with 20% buffer:', estimatedGasLimit);
          } else {
            // For ETH transfers, add 10% buffer
            estimatedGasLimit = Math.ceil(estimatedGasLimit * 1.1);
            console.log('[CRYPTO BUY PREVIEW] ETH transfer - adjusted gas limit with 10% buffer:', estimatedGasLimit);
          }
          
          const adjustedGasLimit = estimatedGasLimit.toString();

          gasEstimate = {
            gasLimit: adjustedGasLimit,
            gasPrice: {
              wei: gasEstimateResult.gasPrice,
              gwei: ethereumGasService.weiToGwei(gasEstimateResult.gasPrice),
            },
          };

          // Calculate gas fee in ETH using adjusted gas limit
          gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
            adjustedGasLimit,
            gasEstimateResult.gasPrice
          ));
          console.log('[CRYPTO BUY PREVIEW] Gas fee in ETH:', gasFeeEth.toString());

          // Convert gas fee to USD (using ETH price)
          let ethPrice = new Decimal('0');
          if (currency.toUpperCase() === 'ETH') {
            ethPrice = new Decimal(walletCurrency.price.toString());
            console.log('[CRYPTO BUY PREVIEW] Using ETH price from wallet currency:', ethPrice.toString(), 'USD');
          } else {
            // Get ETH price for converting gas fee
            const ethWalletCurrency = await prisma.walletCurrency.findFirst({
              where: { currency: 'ETH', blockchain: 'ethereum' },
            });
            if (ethWalletCurrency?.price) {
              ethPrice = new Decimal(ethWalletCurrency.price.toString());
              console.log('[CRYPTO BUY PREVIEW] Using ETH price for gas conversion:', ethPrice.toString(), 'USD');
            }
          }
          
          gasFeeUsd = gasFeeEth.mul(ethPrice);
          console.log('[CRYPTO BUY PREVIEW] Gas fee in USD:', gasFeeUsd.toString());

          // Convert gas fee to NGN (using same rate as purchase from quote)
          // Use the same USD to NGN rate that was used for the purchase amount
          const quoteUsdToNgnRate = parseFloat(quote.rateNgnToUsd);
          if (quoteUsdToNgnRate > 0) {
            // rateNgnToUsd is NGN per USD, so: gasFeeNgn = gasFeeUsd * rate
            gasFeeNgn = gasFeeUsd.mul(new Decimal(quoteUsdToNgnRate.toString()));
            console.log('[CRYPTO BUY PREVIEW] Using USD to NGN rate from quote:', quoteUsdToNgnRate);
          } else {
            // Fallback: fetch rate if not available in quote
            console.log('[CRYPTO BUY PREVIEW] Rate not in quote, fetching from service');
            const usdToNgnRate = await cryptoRateService.getRateForAmount('BUY', parseFloat(gasFeeUsd.toString()));
            if (usdToNgnRate) {
              gasFeeNgn = gasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));
              console.log('[CRYPTO BUY PREVIEW] Fetched USD to NGN rate:', usdToNgnRate.rate);
            }
          }
          
          // Add minimum 10 NGN buffer to gas fee for safety
          const minGasFeeBuffer = new Decimal('10');
          if (gasFeeNgn.lessThan(minGasFeeBuffer)) {
            console.log('[CRYPTO BUY PREVIEW] Gas fee below minimum buffer, adjusting:', {
              original: gasFeeNgn.toString(),
              buffer: minGasFeeBuffer.toString(),
            });
            gasFeeNgn = minGasFeeBuffer;
          } else {
            // Add 10 NGN buffer even if gas fee is already higher
            gasFeeNgn = gasFeeNgn.plus(minGasFeeBuffer);
            console.log('[CRYPTO BUY PREVIEW] Added 10 NGN buffer to gas fee');
          }
          console.log('[CRYPTO BUY PREVIEW] Final gas fee in NGN (with buffer):', gasFeeNgn.toString());

          // Add gas fee to total amount
          totalAmountNgn = amountNgnDecimal.plus(gasFeeNgn);
          console.log('[CRYPTO BUY PREVIEW] Total amount breakdown:');
          console.log('  Crypto amount (NGN):', amountNgnDecimal.toString());
          console.log('  Gas fee (NGN):', gasFeeNgn.toString());
          console.log('  Total amount (NGN):', totalAmountNgn.toString());
        } else {
          console.log('[CRYPTO BUY PREVIEW] Master wallet or deposit address not found - skipping gas calculation');
        }
      } catch (error: any) {
        console.error('[CRYPTO BUY PREVIEW] Error in gas fee calculation or master wallet check:', error);
        console.error('[CRYPTO BUY PREVIEW] Stack:', error.stack);
        // Don't fail the preview, just log the error
      }
    } */

    // Calculate balances after transaction
    const fiatBalanceAfter = fiatBalance.minus(totalAmountNgn);
    const cryptoBalanceAfter = cryptoBalanceBefore.plus(amountCryptoDecimal);

    console.log('[CRYPTO BUY PREVIEW] Balance calculations:');
    console.log('  Fiat balance before:', fiatBalance.toString());
    console.log('  Fiat balance after:', fiatBalanceAfter.toString());
    console.log('  Crypto balance before:', cryptoBalanceBefore.toString());
    console.log('  Crypto balance after:', cryptoBalanceAfter.toString());

    // Check if sufficient balance (including gas fees)
    const hasSufficientBalance = fiatBalance.gte(totalAmountNgn);
    const canProceed = hasSufficientBalance && hasSufficientMasterBalance;
    
    console.log('[CRYPTO BUY PREVIEW] Sufficiency checks:');
    console.log('  Has sufficient fiat balance:', hasSufficientBalance);
    console.log('  Has sufficient master wallet balance:', hasSufficientMasterBalance);
    console.log('  Can proceed:', canProceed);

    console.log('\n========================================');
    console.log('[CRYPTO BUY PREVIEW] Preview complete');
    console.log('========================================');
    console.log('Gas fee estimate:', {
      eth: gasFeeEth.toString(),
      usd: gasFeeUsd.toString(),
      ngn: gasFeeNgn.toString(),
      gasLimit: gasEstimate?.gasLimit || 'undefined',
      gasPriceGwei: gasEstimate?.gasPrice?.gwei || 'undefined',
      gasEstimateObject: gasEstimate ? 'exists' : 'null/undefined',
    });
    console.log('Total amount breakdown:');
    console.log('  Crypto amount (NGN):', amountNgnDecimal.toString());
    console.log('  Gas fee (NGN):', gasFeeNgn.toString());
    console.log('  Total amount (NGN):', totalAmountNgn.toString());
    console.log('Can proceed:', canProceed);
    console.log('========================================\n');

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
      
      // Gas fees (Ethereum only)
      gasFee: blockchain.toLowerCase() === 'ethereum' ? {
        eth: gasFeeEth.toString(),
        usd: gasFeeUsd.toString(),
        ngn: gasFeeNgn.toString(),
        gasLimit: gasEstimate?.gasLimit,
        gasPrice: gasEstimate?.gasPrice,
      } : null,
      
      // Total amount including gas fees
      totalAmountNgn: totalAmountNgn.toString(),
      
      // Rates
      rateUsdToCrypto: quote.rateUsdToCrypto,
      rateNgnToUsd: quote.rateNgnToUsd,
      
      // Master wallet info (Ethereum only)
      masterWallet: blockchain.toLowerCase() === 'ethereum' ? {
        balance: masterWalletBalance,
        hasSufficientBalance: hasSufficientMasterBalance,
      } : null,
      
      // Current balances
      fiatBalanceBefore: fiatBalance.toString(),
      cryptoBalanceBefore: cryptoBalanceBefore.toString(),
      
      // Projected balances after transaction
      fiatBalanceAfter: fiatBalanceAfter.toString(),
      cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      
      // Validation
      hasSufficientBalance,
      canProceed,
      
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

