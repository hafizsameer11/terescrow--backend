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
import cryptoLogger from '../../utils/crypto.logger';

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

    console.log('\n========================================');
    console.log('[CRYPTO SELL] Starting sell transaction');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('========================================\n');

    // Only Ethereum blockchain with USDT ERC-20 is currently supported
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto sell for ${blockchain} blockchain is not active yet. Only Ethereum (USDT ERC-20) is currently supported.`);
    }

    // Only USDT is currently supported
    if (currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto sell for ${currency} on ${blockchain} is not active yet. Only USDT ERC-20 on Ethereum is currently supported.`);
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

    // Get user's virtual account with deposit address (outside transaction)
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

    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;
    if (!depositAddress) {
      throw new Error(`Deposit address not found for ${currency} on ${blockchain}. Please contact support.`);
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

    // Calculate gas fees BEFORE blockchain transfers
    let totalGasFeeNgn = new Decimal('0');
    let ethTransferTxHash: string | null = null;
    let tokenTransferTxHash: string | null = null;
    let needsEthTransfer = false;
    let userEthBalance = new Decimal('0');
    let ethNeededForGas = new Decimal('0');
    let masterWalletAddress: string | null = null;

    // Step 1: Check ETH balance and calculate gas fees
    if (blockchain.toLowerCase() === 'ethereum' && currency.toUpperCase() === 'USDT') {
      try {
        console.log('[CRYPTO SELL] Checking ETH balance and calculating gas fees');

        // Import services
        const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
        const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

        // Get master wallet
        const masterWallet = await prisma.masterWallet.findUnique({
          where: { blockchain: 'ethereum' },
        });

        if (!masterWallet || !masterWallet.address || !masterWallet.privateKey) {
          throw new Error('Master wallet not found or missing private key for Ethereum');
        }

        masterWalletAddress = masterWallet.address;

        // Decrypt master wallet private key
        const crypto = require('crypto');
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

        let masterPrivateKey = decryptPrivateKey(masterWallet.privateKey);
        masterPrivateKey = masterPrivateKey.trim();
        if (masterPrivateKey.startsWith('0x')) {
          masterPrivateKey = masterPrivateKey.substring(2).trim();
        }

        // Check user's ETH balance
        try {
          const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          userEthBalance = new Decimal(userEthBalanceStr);
          console.log('[CRYPTO SELL] User ETH balance:', userEthBalance.toString());
        } catch (error: any) {
          console.error('[CRYPTO SELL] Error checking user ETH balance:', error);
          userEthBalance = new Decimal('0');
        }

        // Estimate gas for token transfer
        const tokenTransferGasEstimate = await ethereumGasService.estimateGasFee(
          depositAddress,
          masterWallet.address,
          amountCryptoDecimal.toString(),
          false
        );

        let tokenGasLimit = parseInt(tokenTransferGasEstimate.gasLimit);
        const erc20GasLimit = 65000;
        tokenGasLimit = Math.max(tokenGasLimit, erc20GasLimit);
        tokenGasLimit = Math.ceil(tokenGasLimit * 1.2); // Add 20% buffer

        const tokenGasPriceWei = tokenTransferGasEstimate.gasPrice;
        const tokenGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
          tokenGasLimit.toString(),
          tokenGasPriceWei
        ));

        // Get ETH price
        const ethWalletCurrency = await prisma.walletCurrency.findFirst({
          where: { currency: 'ETH', blockchain: 'ethereum' },
        });
        const ethPrice = ethWalletCurrency?.price ? new Decimal(ethWalletCurrency.price.toString()) : new Decimal('0');

        // Check if user needs ETH
        // Send at least 2x the estimated gas fee to ensure sufficient balance
        // Tatum's actual requirement may be higher than our estimate
        const minimumEthNeeded = tokenGasFeeEth.mul(new Decimal('2')).plus(new Decimal('0.002'));
        ethNeededForGas = minimumEthNeeded;

        let ethTransferGasEstimate: any = null;
        let ethGasLimit = 0;
        let ethGasPriceWei = '0';

        if (userEthBalance.lessThan(minimumEthNeeded)) {
          needsEthTransfer = true;
          console.log('[CRYPTO SELL] User needs ETH transfer');

          // Estimate gas for ETH transfer
          ethTransferGasEstimate = await ethereumGasService.estimateGasFee(
            masterWallet.address,
            depositAddress,
            minimumEthNeeded.toString(),
            false
          );

          ethGasLimit = parseInt(ethTransferGasEstimate.gasLimit);
          ethGasLimit = Math.ceil(ethGasLimit * 1.1);

          ethGasPriceWei = ethTransferGasEstimate.gasPrice;
          const ethTransferGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
            ethGasLimit.toString(),
            ethGasPriceWei
          ));

          const ethTransferGasFeeUsd = ethTransferGasFeeEth.mul(ethPrice);
          const ethTransferGasFeeNgn = ethTransferGasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

          const tokenGasFeeUsd = tokenGasFeeEth.mul(ethPrice);
          const tokenGasFeeNgn = tokenGasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));

          totalGasFeeNgn = ethTransferGasFeeNgn.plus(tokenGasFeeNgn);
        } else {
          const tokenGasFeeUsd = tokenGasFeeEth.mul(ethPrice);
          const tokenGasFeeNgn = tokenGasFeeUsd.mul(new Decimal(usdToNgnRate.rate.toString()));
          totalGasFeeNgn = tokenGasFeeNgn;
        }

        // Add minimum 10 NGN buffer
        const minGasFeeBuffer = new Decimal('10');
        if (totalGasFeeNgn.lessThan(minGasFeeBuffer)) {
          totalGasFeeNgn = minGasFeeBuffer;
        } else {
          totalGasFeeNgn = totalGasFeeNgn.plus(minGasFeeBuffer);
        }

        console.log('[CRYPTO SELL] Total gas fee (NGN):', totalGasFeeNgn.toString());

        // Step 2: Execute blockchain transfers BEFORE database updates
        // First: Transfer ETH if needed
        if (needsEthTransfer) {
          console.log('[CRYPTO SELL] Transferring ETH to user wallet');
          const { ethereumTransactionService } = await import('../ethereum/ethereum.transaction.service');
          
          try {
            ethTransferTxHash = await ethereumTransactionService.sendTransaction(
              depositAddress,
              minimumEthNeeded.toString(),
              'ETH',
              masterPrivateKey,
              ethereumGasService.weiToGwei(ethGasPriceWei),
              ethGasLimit.toString(),
              false // mainnet
            );

            if (!ethTransferTxHash) {
              throw new Error('ETH transfer failed: No transaction hash returned');
            }

            console.log('[CRYPTO SELL] ETH transfer successful:', ethTransferTxHash);
            cryptoLogger.transfer('ETH_TRANSFER_SUCCESS', {
              userId,
              from: masterWallet.address,
              to: depositAddress,
              amount: minimumEthNeeded.toString(),
              txHash: ethTransferTxHash,
            });

            // Wait and verify ETH balance is updated before proceeding with token transfer
            console.log('[CRYPTO SELL] Waiting for ETH balance to update...');
            let retries = 0;
            const maxRetries = 10;
            let verifiedBalance = false;

            while (retries < maxRetries && !verifiedBalance) {
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between checks

              try {
                const currentBalance = await ethereumBalanceService.getETHBalance(depositAddress, false);
                const currentBalanceDecimal = new Decimal(currentBalance);
                const requiredBalance = tokenGasFeeEth.plus(new Decimal('0.001'));

                console.log(`[CRYPTO SELL] Balance check ${retries + 1}/${maxRetries}:`, {
                  current: currentBalanceDecimal.toString(),
                  required: requiredBalance.toString(),
                  sufficient: currentBalanceDecimal.gte(requiredBalance),
                });

                if (currentBalanceDecimal.gte(requiredBalance)) {
                  verifiedBalance = true;
                  console.log('[CRYPTO SELL] ETH balance verified - sufficient funds available');
                } else {
                  retries++;
                  if (retries >= maxRetries) {
                    console.warn('[CRYPTO SELL] ETH balance not updated after max retries, but proceeding anyway');
                  }
                }
              } catch (error: any) {
                console.error('[CRYPTO SELL] Error checking ETH balance:', error);
                retries++;
                if (retries >= maxRetries) {
                  console.warn('[CRYPTO SELL] Failed to verify ETH balance after max retries, but proceeding anyway');
                  break;
                }
              }
            }

            if (!verifiedBalance && retries >= maxRetries) {
              console.warn('[CRYPTO SELL] Warning: ETH balance verification failed, but proceeding with token transfer');
            }
          } catch (error: any) {
            console.error('[CRYPTO SELL] ETH transfer failed:', error);
            cryptoLogger.exception('ETH transfer to user', error, {
              userId,
              depositAddress,
              ethNeeded: minimumEthNeeded.toString(),
            });
            throw new Error(`Failed to transfer ETH to user wallet: ${error.message || 'Unknown error'}`);
          }
        }

        // Second: Transfer USDT token from user to master wallet
        console.log('[CRYPTO SELL] Transferring USDT from user to master wallet');
        
        // Get user's deposit address private key
        const depositAddressRecord = virtualAccount.depositAddresses[0];
        if (!depositAddressRecord || !depositAddressRecord.privateKey) {
          throw new Error('Deposit address private key not found');
        }

        let userPrivateKey = decryptPrivateKey(depositAddressRecord.privateKey);
        userPrivateKey = userPrivateKey.trim();
        if (userPrivateKey.startsWith('0x')) {
          userPrivateKey = userPrivateKey.substring(2).trim();
        }

        // Validate private key format
        if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
          throw new Error('Invalid user private key format');
        }

        const { ethereumTransactionService } = await import('../ethereum/ethereum.transaction.service');

        try {
          tokenTransferTxHash = await ethereumTransactionService.sendTransaction(
            masterWallet.address,
            amountCryptoDecimal.toString(),
            'USDT',
            userPrivateKey,
            ethereumGasService.weiToGwei(tokenGasPriceWei),
            tokenGasLimit.toString(),
            false // mainnet
          );

          if (!tokenTransferTxHash) {
            throw new Error('Token transfer failed: No transaction hash returned');
          }

          console.log('[CRYPTO SELL] Token transfer successful:', tokenTransferTxHash);
          cryptoLogger.transfer('TOKEN_TRANSFER_SUCCESS', {
            userId,
            from: depositAddress,
            to: masterWallet.address,
            amount: amountCryptoDecimal.toString(),
            currency: 'USDT',
            txHash: tokenTransferTxHash,
          });
        } catch (error: any) {
          console.error('[CRYPTO SELL] Token transfer failed:', error);
          cryptoLogger.exception('Token transfer from user', error, {
            userId,
            depositAddress,
            amount: amountCryptoDecimal.toString(),
            currency: 'USDT',
          });

          // If ETH transfer succeeded but token transfer failed, log this critical situation
          if (needsEthTransfer && ethTransferTxHash) {
            console.error('[CRYPTO SELL] CRITICAL: ETH transfer succeeded but token transfer failed!', {
              userId,
              depositAddress,
              ethTransferTxHash,
              ethAmount: minimumEthNeeded.toString(),
              tokenAmount: amountCryptoDecimal.toString(),
              currency: 'USDT',
              error: error.message,
            });

            cryptoLogger.exception('PARTIAL_FAILURE_ETH_SENT_TOKEN_FAILED', error, {
              userId,
              depositAddress,
              ethTransferTxHash,
              ethAmount: minimumEthNeeded.toString(),
              tokenAmount: amountCryptoDecimal.toString(),
              currency: 'USDT',
              note: 'ETH was successfully transferred to user wallet, but token transfer failed. Manual intervention may be required.',
            });
          }

          throw new Error(`Failed to transfer token from user wallet: ${error.message || 'Unknown error'}`);
        }
      } catch (error: any) {
        console.error('[CRYPTO SELL] Blockchain transfer error:', error);

        // If ETH was sent but token transfer failed, we cannot rollback the on-chain ETH transfer
        // Log this as a critical issue that needs manual intervention
        if (needsEthTransfer && ethTransferTxHash && !tokenTransferTxHash) {
          console.error('[CRYPTO SELL] CRITICAL PARTIAL FAILURE - ETH sent but token transfer failed', {
            userId,
            depositAddress,
            ethTransferTxHash,
            error: error.message,
            actionRequired: 'User wallet now has ETH but sell transaction failed. Consider manual refund or retry.',
          });
        }

        throw error;
      }
    }

    // Calculate final amount after gas fees
    const finalAmountNgn = amountNgn.minus(totalGasFeeNgn);
    const finalAmountNgnDecimal = finalAmountNgn.greaterThan(0) ? finalAmountNgn : new Decimal('0');

    if (finalAmountNgnDecimal.lessThanOrEqualTo(0)) {
      throw new Error('Amount after gas fees is zero or negative. Gas fees exceed the sell amount.');
    }

    // Get user's fiat wallet (outside transaction)
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const balanceBefore = new Decimal(fiatWallet.balance);
    const balanceAfter = balanceBefore.plus(finalAmountNgnDecimal);

    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);

    // Now execute the database transaction
    return await prisma.$transaction(async (tx) => {

      // Step 1: Debit virtual account (crypto)
      await tx.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: cryptoBalanceAfter.toString(),
          accountBalance: cryptoBalanceAfter.toString(),
        },
      });

      // Step 2: Credit fiat wallet (NGN) with final amount after gas fees
      // Create fiat transaction first
      const fiatTransaction = await tx.fiatTransaction.create({
        data: {
          userId,
          walletId: fiatWallet.id,
          type: 'CRYPTO_SELL',
          status: 'pending',
          currency: 'NGN',
          amount: finalAmountNgnDecimal, // Final amount after gas fees
          fees: totalGasFeeNgn, // Gas fees as fees
          totalAmount: finalAmountNgnDecimal,
          balanceBefore: balanceBefore,
          description: `Sell ${amountCryptoDecimal.toString()} ${currency}`,
        },
      });

      // Credit wallet with final amount
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

      // Step 3: Create crypto transaction record with transaction hashes
      const transactionId = `SELL-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const cryptoTransaction = await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId: virtualAccount.id,
          transactionType: 'SELL',
          transactionId,
          status: 'successful', // Blockchain transfers already succeeded
          currency: virtualAccount.currency,
          blockchain: virtualAccount.blockchain,
          cryptoSell: {
            create: {
              fromAddress: depositAddress,
              toAddress: masterWalletAddress || null,
              amount: amountCryptoDecimal,
              amountUsd: amountUsd,
              amountNaira: finalAmountNgnDecimal, // Final amount after gas fees
              rateCryptoToUsd: cryptoPrice,
              rateUsdToNgn: new Decimal(usdToNgnRate.rate.toString()),
              txHash: tokenTransferTxHash || null, // Token transfer hash (main transaction)
            },
          },
        },
      });

      // Log the complete transaction
      cryptoLogger.transaction('SELL_COMPLETE', {
        transactionId: cryptoTransaction.transactionId,
        userId,
        currency: currency.toUpperCase(),
        blockchain: blockchain.toLowerCase(),
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNgn: finalAmountNgnDecimal.toString(),
        gasFeeNgn: totalGasFeeNgn.toString(),
        rateUsdToCrypto: cryptoPrice.toString(),
        rateNgnToUsd: usdToNgnRate.rate.toString(),
        txHash: tokenTransferTxHash,
        ethTransferTxHash: ethTransferTxHash || null,
        fiatWalletId: fiatWallet.id,
        virtualAccountId: virtualAccount.id,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        cryptoBalanceBefore: cryptoBalanceBefore.toString(),
        cryptoBalanceAfter: cryptoBalanceAfter.toString(),
      });

      console.log('[CRYPTO SELL] Transaction completed successfully');
      console.log('  Transaction ID:', transactionId);
      console.log('  Token TX Hash:', tokenTransferTxHash);
      if (ethTransferTxHash) {
        console.log('  ETH TX Hash:', ethTransferTxHash);
      }
      console.log('  Final amount (NGN):', finalAmountNgnDecimal.toString());
      console.log('  Gas fee (NGN):', totalGasFeeNgn.toString());

      return {
        transactionId: cryptoTransaction.transactionId,
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNgn: finalAmountNgnDecimal.toString(), // Final amount after gas fees
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
      maxWait: 10000,
      timeout: 15000,
    });
  }

  /**
   * Calculate sell quote (preview before selling)
   * Returns estimated NGN amount without executing the transaction
   * For USDT ERC-20, includes gas fee calculations
   */
  async calculateSellQuote(amountCrypto: number, currency: string, blockchain: string) {
    console.log('\n========================================');
    console.log('[CRYPTO SELL QUOTE] Starting quote calculation');
    console.log('========================================');
    console.log('Amount:', amountCrypto);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('========================================\n');

    // Only Ethereum blockchain with USDT ERC-20 is currently supported
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto sell for ${blockchain} blockchain is not active yet. Only Ethereum (USDT ERC-20) is currently supported.`);
    }

    // Only USDT is currently supported
    if (currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto sell for ${currency} on ${blockchain} is not active yet. Only USDT ERC-20 on Ethereum is currently supported.`);
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

    console.log('[CRYPTO SELL QUOTE] Quote calculated:', {
      amountCrypto: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      amountNgn: amountNgn.toString(),
      rateCryptoToUsd: cryptoPrice.toString(),
      rateUsdToNgn: usdToNgnRate.rate.toString(),
    });

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
   * Includes current balances, rates, gas fees, and all transaction details
   * For USDT ERC-20: checks ETH balance and calculates gas fees
   */
  async previewSellTransaction(userId: number, amountCrypto: number, currency: string, blockchain: string) {
    console.log('\n========================================');
    console.log('[CRYPTO SELL PREVIEW] Starting preview');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amountCrypto);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('========================================\n');

    // Only Ethereum blockchain with USDT ERC-20 is currently supported
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto sell for ${blockchain} blockchain is not active yet. Only Ethereum (USDT ERC-20) is currently supported.`);
    }

    // Only USDT is currently supported
    if (currency.toUpperCase() !== 'USDT') {
      throw new Error(`Crypto sell for ${currency} on ${blockchain} is not active yet. Only USDT ERC-20 on Ethereum is currently supported.`);
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

    // Get user's virtual account for this crypto with deposit address
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

    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;
    if (!depositAddress) {
      throw new Error(`Deposit address not found for ${currency} on ${blockchain}. Please contact support.`);
    }

    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
    const amountCryptoDecimal = new Decimal(amountCrypto);

    // Get user's fiat wallet
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
    const fiatBalanceBefore = new Decimal(fiatWallet.balance);

    // Calculate quote
    const quote = await this.calculateSellQuote(amountCrypto, currency, blockchain);
    const amountNgnDecimal = new Decimal(quote.amountNgn);

    // Initialize gas fee variables
    let totalGasFeeEth = new Decimal('0');
    let totalGasFeeUsd = new Decimal('0');
    let totalGasFeeNgn = new Decimal('0');
    let needsEthTransfer = false;
    let ethTransferGasFeeNgn = new Decimal('0');
    let tokenTransferGasFeeNgn = new Decimal('0');
    let ethNeededForGas = new Decimal('0');
    let ethNeededNgn = new Decimal('0');
    let userEthBalance = new Decimal('0');
    let gasEstimate: any = null;

    // For USDT ERC-20: Check ETH balance and calculate gas fees
    if (blockchain.toLowerCase() === 'ethereum' && currency.toUpperCase() === 'USDT') {
      try {
        console.log('[CRYPTO SELL PREVIEW] Checking user ETH balance and calculating gas fees');
        console.log('User deposit address:', depositAddress);

        // Import services
        const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
        const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

        // Get master wallet
        const masterWallet = await prisma.masterWallet.findUnique({
          where: { blockchain: 'ethereum' },
        });

        if (!masterWallet || !masterWallet.address) {
          throw new Error('Master wallet not found for Ethereum');
        }

        // Check user's ETH balance
        try {
          const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          userEthBalance = new Decimal(userEthBalanceStr);
          console.log('[CRYPTO SELL PREVIEW] User ETH balance:', userEthBalance.toString());
        } catch (error: any) {
          console.error('[CRYPTO SELL PREVIEW] Error checking user ETH balance:', error);
          userEthBalance = new Decimal('0');
        }

        // Estimate gas fee for token transfer (user to master wallet)
        console.log('[CRYPTO SELL PREVIEW] Estimating gas for token transfer');
        const tokenTransferGasEstimate = await ethereumGasService.estimateGasFee(
          depositAddress,
          masterWallet.address,
          amountCryptoDecimal.toString(),
          false // mainnet
        );

        // For ERC-20 token transfers, use higher gas limit with buffer
        let tokenGasLimit = parseInt(tokenTransferGasEstimate.gasLimit);
        const erc20GasLimit = 65000; // Standard ERC-20 transfer gas limit
        tokenGasLimit = Math.max(tokenGasLimit, erc20GasLimit);
        tokenGasLimit = Math.ceil(tokenGasLimit * 1.2); // Add 20% buffer

        const tokenGasPriceWei = tokenTransferGasEstimate.gasPrice;
        const tokenGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
          tokenGasLimit.toString(),
          tokenGasPriceWei
        ));

        console.log('[CRYPTO SELL PREVIEW] Token transfer gas estimate:', {
          gasLimit: tokenGasLimit,
          gasPriceGwei: ethereumGasService.weiToGwei(tokenGasPriceWei),
          gasFeeEth: tokenGasFeeEth.toString(),
        });

        // Get ETH price for converting gas fees
        const ethWalletCurrency = await prisma.walletCurrency.findFirst({
          where: { currency: 'ETH', blockchain: 'ethereum' },
        });
        let ethPrice = new Decimal('0');
        if (ethWalletCurrency?.price) {
          ethPrice = new Decimal(ethWalletCurrency.price.toString());
        }

        // Convert token transfer gas fee to USD and NGN
        const tokenGasFeeUsd = tokenGasFeeEth.mul(ethPrice);
        tokenTransferGasFeeNgn = tokenGasFeeUsd.mul(new Decimal(quote.rateUsdToNgn));
        console.log('[CRYPTO SELL PREVIEW] Token transfer gas fee:', {
          eth: tokenGasFeeEth.toString(),
          usd: tokenGasFeeUsd.toString(),
          ngn: tokenTransferGasFeeNgn.toString(),
        });

        // Check if user has enough ETH to pay for gas
        const minimumEthNeeded = tokenGasFeeEth.plus(new Decimal('0.001')); // Add small buffer
        ethNeededForGas = minimumEthNeeded;

        if (userEthBalance.lessThan(minimumEthNeeded)) {
          needsEthTransfer = true;
          console.log('[CRYPTO SELL PREVIEW] User does not have sufficient ETH, will need transfer');
          console.log('  User ETH balance:', userEthBalance.toString());
          console.log('  Minimum ETH needed:', minimumEthNeeded.toString());

          // Estimate gas for ETH transfer (master wallet to user)
          console.log('[CRYPTO SELL PREVIEW] Estimating gas for ETH transfer to user');
          const ethTransferGasEstimate = await ethereumGasService.estimateGasFee(
            masterWallet.address,
            depositAddress,
            minimumEthNeeded.toString(),
            false // mainnet
          );

          let ethGasLimit = parseInt(ethTransferGasEstimate.gasLimit);
          ethGasLimit = Math.ceil(ethGasLimit * 1.1); // Add 10% buffer for ETH transfer

          const ethGasPriceWei = ethTransferGasEstimate.gasPrice;
          const ethTransferGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
            ethGasLimit.toString(),
            ethGasPriceWei
          ));

          // Convert ETH transfer gas fee to USD and NGN
          const ethTransferGasFeeUsd = ethTransferGasFeeEth.mul(ethPrice);
          ethTransferGasFeeNgn = ethTransferGasFeeUsd.mul(new Decimal(quote.rateUsdToNgn));

          console.log('[CRYPTO SELL PREVIEW] ETH transfer gas estimate:', {
            gasLimit: ethGasLimit,
            gasPriceGwei: ethereumGasService.weiToGwei(ethGasPriceWei),
            gasFeeEth: ethTransferGasFeeEth.toString(),
            gasFeeUsd: ethTransferGasFeeUsd.toString(),
            gasFeeNgn: ethTransferGasFeeNgn.toString(),
          });

          // Convert ETH needed to NGN
          ethNeededNgn = ethNeededForGas.mul(ethPrice).mul(new Decimal(quote.rateUsdToNgn));
          console.log('[CRYPTO SELL PREVIEW] ETH needed for gas (in NGN):', ethNeededNgn.toString());
        } else {
          console.log('[CRYPTO SELL PREVIEW] User has sufficient ETH balance');
        }

        // Calculate total gas fees
        totalGasFeeEth = needsEthTransfer 
          ? ethNeededForGas.plus(tokenGasFeeEth) // ETH needed + token transfer gas
          : tokenGasFeeEth; // Only token transfer gas

        totalGasFeeUsd = totalGasFeeEth.mul(ethPrice);
        totalGasFeeNgn = needsEthTransfer
          ? ethTransferGasFeeNgn.plus(tokenTransferGasFeeNgn) // Both transfer gas fees
          : tokenTransferGasFeeNgn; // Only token transfer gas

        // Add minimum 10 NGN buffer to total gas fee
        const minGasFeeBuffer = new Decimal('10');
        if (totalGasFeeNgn.lessThan(minGasFeeBuffer)) {
          totalGasFeeNgn = minGasFeeBuffer;
        } else {
          totalGasFeeNgn = totalGasFeeNgn.plus(minGasFeeBuffer);
        }

        gasEstimate = {
          tokenTransfer: {
            gasLimit: tokenGasLimit.toString(),
            gasPrice: {
              wei: tokenGasPriceWei,
              gwei: ethereumGasService.weiToGwei(tokenGasPriceWei),
            },
            gasFeeEth: tokenGasFeeEth.toString(),
            gasFeeUsd: tokenGasFeeUsd.toString(),
            gasFeeNgn: tokenTransferGasFeeNgn.toString(),
          },
          needsEthTransfer,
          userEthBalance: userEthBalance.toString(),
          ethNeededForGas: ethNeededForGas.toString(),
          ethNeededNgn: needsEthTransfer ? ethNeededNgn.toString() : '0',
          ethTransferGasFeeNgn: needsEthTransfer ? ethTransferGasFeeNgn.toString() : '0',
        };

        console.log('[CRYPTO SELL PREVIEW] Total gas fees:', {
          eth: totalGasFeeEth.toString(),
          usd: totalGasFeeUsd.toString(),
          ngn: totalGasFeeNgn.toString(),
        });

      } catch (error: any) {
        console.error('[CRYPTO SELL PREVIEW] Error in gas fee calculation:', error);
        console.error('[CRYPTO SELL PREVIEW] Stack:', error.stack);
        // Don't fail the preview, but log the error
      }
    }

    // Calculate final amount after deducting gas fees
    const finalAmountNgn = amountNgnDecimal.minus(totalGasFeeNgn);
    const finalAmountNgnDecimal = finalAmountNgn.greaterThan(0) ? finalAmountNgn : new Decimal('0');

    // Calculate balances after transaction
    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);
    const fiatBalanceAfter = fiatBalanceBefore.plus(finalAmountNgnDecimal);

    // Check if sufficient balance
    const hasSufficientBalance = cryptoBalanceBefore.gte(amountCryptoDecimal);
    const hasSufficientAmountAfterGas = finalAmountNgnDecimal.greaterThan(0);
    const canProceed = hasSufficientBalance && hasSufficientAmountAfterGas;

    console.log('[CRYPTO SELL PREVIEW] Final calculations:');
    console.log('  Amount before gas:', amountNgnDecimal.toString(), 'NGN');
    console.log('  Total gas fee:', totalGasFeeNgn.toString(), 'NGN');
    console.log('  Final amount received:', finalAmountNgnDecimal.toString(), 'NGN');
    console.log('  Can proceed:', canProceed);

    console.log('\n========================================');
    console.log('[CRYPTO SELL PREVIEW] Preview complete');
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
      amountNgn: quote.amountNgn, // Amount before gas fees
      
      // Gas fees (Ethereum only)
      gasFee: blockchain.toLowerCase() === 'ethereum' ? {
        eth: totalGasFeeEth.toString(),
        usd: totalGasFeeUsd.toString(),
        ngn: totalGasFeeNgn.toString(),
        tokenTransfer: gasEstimate?.tokenTransfer,
        needsEthTransfer: needsEthTransfer,
        userEthBalance: userEthBalance.toString(),
        ethNeededForGas: ethNeededForGas.toString(),
        ethNeededNgn: ethNeededNgn.toString(),
        ethTransferGasFeeNgn: ethTransferGasFeeNgn.toString(),
      } : null,
      
      // Final amount after gas fees
      finalAmountNgn: finalAmountNgnDecimal.toString(),
      
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
      hasSufficientAmountAfterGas,
      canProceed,
      
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

