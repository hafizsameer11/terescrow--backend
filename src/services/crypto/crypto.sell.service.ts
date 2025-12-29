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
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

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

    // Pre-transaction: Get wallet currency and rates (outside transaction to avoid timeout)
    // Handle cases where currency might be stored as "USDT_TRON", "USDT_ETH", etc. instead of just "USDT"
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

    if (!walletCurrency) {
      throw new Error(`Currency ${currency} on ${blockchain} is not supported`);
    }

    if (!walletCurrency.price) {
      throw new Error(`Price not set for ${currency}`);
    }

    // Get user's virtual account with deposit address (outside transaction)
    // Use the matched walletCurrency's currency value (might be "USDT_TRON" instead of "USDT")
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: walletCurrency.currency, // Use the actual currency from wallet_currencies
        blockchain: blockchainLower,
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

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated transaction only
    // Calculate gas fees BEFORE blockchain transfers - SIMULATED VALUES
    let totalGasFeeNgn = new Decimal('10'); // Simulated minimum gas fee in NGN
    let ethTransferTxHash: string | null = null;
    let tokenTransferTxHash: string | null = null;
    let needsEthTransfer = false;
    let userEthBalance = new Decimal('0');
    let ethNeededForGas = new Decimal('0');
    let masterWalletAddress: string | null = null;
    let ethToSend: Decimal = new Decimal('0');

    // Get user's fiat wallet (needed for retry job enqueue)
    const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');

    // Generate simulated transaction hash
    if (blockchain.toLowerCase() === 'ethereum' && currency.toUpperCase() === 'USDT') {
      const crypto = require('crypto');
      tokenTransferTxHash = '0x' + crypto.randomBytes(32).toString('hex');
      
      // Get master wallet address for database record
      const masterWallet = await prisma.masterWallet.findUnique({
        where: { blockchain: 'ethereum' },
      });
      masterWalletAddress = masterWallet?.address || null;

      cryptoLogger.info('Simulated sell transaction', {
        userId,
        currency: currency.toUpperCase(),
        amount: amountCryptoDecimal.toString(),
        simulatedTxHash: tokenTransferTxHash,
        note: 'Blockchain calls commented out - using simulated transaction hash',
      });
    }

    // COMMENTED OUT: Real blockchain ETH balance checks and gas fee calculations
    // Step 1: Check ETH balance and calculate gas fees
    /* if (blockchain.toLowerCase() === 'ethereum' && currency.toUpperCase() === 'USDT') {
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
        // Add a reasonable buffer: 50% of gas fee or 0.0001 ETH (0.1 mETH), whichever is higher
        // This accounts for gas price fluctuations and estimation differences
        const bufferAmount = Decimal.max(
          tokenGasFeeEth.mul(new Decimal('0.5')), // 50% of gas fee
          new Decimal('0.0001') // Minimum 0.1 mETH buffer
        );
        const minimumEthNeeded = tokenGasFeeEth.plus(bufferAmount);
        const toleranceBuffer = tokenGasFeeEth.mul(new Decimal('0.1')); // 10% tolerance for comparison
        const minimumEthWithTolerance = minimumEthNeeded.minus(toleranceBuffer);
        ethNeededForGas = minimumEthNeeded;

        let ethTransferGasEstimate: any = null;
        let ethGasLimit = 0;
        let ethGasPriceWei = '0';
        let ethToSend: Decimal = new Decimal('0');

        // Only transfer ETH if user's balance is significantly below the required amount
        if (userEthBalance.lessThan(minimumEthWithTolerance)) {
          needsEthTransfer = true;
          console.log('[CRYPTO SELL] User needs ETH transfer');
          console.log('  User ETH balance:', userEthBalance.toString());
          console.log('  Token gas fee:', tokenGasFeeEth.toString());
          console.log('  Buffer amount:', bufferAmount.toString());
          console.log('  Minimum ETH needed:', minimumEthNeeded.toString());
          console.log('  Minimum with tolerance:', minimumEthWithTolerance.toString());

          // Calculate ETH amount to send: gas fee + buffer + small additional safety margin
          // Add only 0.0001 ETH (0.1 mETH) extra for safety, not 0.001 ETH
          ethToSend = minimumEthNeeded.plus(new Decimal('0.0001')); // Small safety margin (0.1 mETH)
          console.log('  ETH to send:', ethToSend.toString());

          // Estimate gas for ETH transfer (estimate for sending ethToSend amount)
          ethTransferGasEstimate = await ethereumGasService.estimateGasFee(
            masterWallet.address,
            depositAddress,
            ethToSend.toString(),
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
              ethToSend.toString(),
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
              amount: ethToSend.toString(),
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
                // Required balance should match what we calculated (gas fee + buffer + small margin)
                const requiredBalance = tokenGasFeeEth.plus(bufferAmount).plus(new Decimal('0.0001'));

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
              ethNeeded: ethToSend.toString(),
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

          // If ETH transfer succeeded but token transfer failed, enqueue retry job
          if (needsEthTransfer && ethTransferTxHash) {
            console.error('[CRYPTO SELL] CRITICAL: ETH transfer succeeded but token transfer failed!', {
              userId,
              depositAddress,
              ethTransferTxHash,
              ethAmount: ethToSend.toString(),
              tokenAmount: amountCryptoDecimal.toString(),
              currency: 'USDT',
              error: error.message,
            });

            cryptoLogger.exception('PARTIAL_FAILURE_ETH_SENT_TOKEN_FAILED', error, {
              userId,
              depositAddress,
              ethTransferTxHash,
              ethAmount: ethToSend.toString(),
              tokenAmount: amountCryptoDecimal.toString(),
              currency: 'USDT',
              note: 'ETH was successfully transferred to user wallet, but token transfer failed. Enqueuing retry job.',
            });

            // Enqueue retry job to attempt token transfer again after ETH settles
            try {
              const { queueManager } = await import('../../queue/queue.manager');
              const finalAmountNgnCalc = amountNgn.minus(totalGasFeeNgn);
              const finalAmountNgnCalcDecimal = finalAmountNgnCalc.greaterThan(0) ? finalAmountNgnCalc : new Decimal('0');

              await queueManager.addJob(
                'tatum',
                'retry-sell-token-transfer',
                {
                  userId,
                  depositAddress,
                  masterWalletAddress: masterWalletAddress || '',
                  amount: amountCryptoDecimal.toString(),
                  currency: currency.toUpperCase(),
                  blockchain: blockchain.toLowerCase(),
                  virtualAccountId: virtualAccount.id,
                  fiatWalletId: fiatWallet.id,
                  amountNgn: finalAmountNgnCalcDecimal.toString(),
                  ethTransferTxHash,
                  ethAmountSent: ethToSend.toString(),
                  attemptNumber: 1, // First retry attempt
                },
                {
                  attempts: 3, // Total 3 attempts (initial + 2 retries)
                  backoff: {
                    type: 'exponential',
                    delay: 10000, // Start with 10 seconds, then 20s, 40s
                  },
                  removeOnComplete: true,
                  removeOnFail: false, // Keep failed jobs for manual review
                }
              );

              console.log('[CRYPTO SELL] Enqueued retry job for token transfer', {
                userId,
                depositAddress,
                ethTransferTxHash,
                attemptNumber: 1,
              });

              // Don't throw error - let the retry job handle it
              throw new Error(`Token transfer failed. Retry job enqueued. Please wait for transaction to complete.`);
            } catch (queueError: any) {
              console.error('[CRYPTO SELL] Failed to enqueue retry job:', queueError);
              // If queue fails, still throw the original error
              throw new Error(`Failed to transfer token from user wallet: ${error.message || 'Unknown error'}`);
            }
          }

          throw new Error(`Failed to transfer token from user wallet: ${error.message || 'Unknown error'}`);
        }
      } catch (error: any) {
        console.error('[CRYPTO SELL] Blockchain transfer error:', error);

        // If ETH was sent but token transfer failed, retry job should have been enqueued
        // If we reach here, it means the retry job enqueue also failed or wasn't triggered
        if (needsEthTransfer && ethTransferTxHash && !tokenTransferTxHash) {
          console.error('[CRYPTO SELL] CRITICAL PARTIAL FAILURE - ETH sent but token transfer failed and retry job not enqueued', {
            userId,
            depositAddress,
            ethTransferTxHash,
            error: error.message,
            actionRequired: 'User wallet now has ETH but sell transaction failed. Manual intervention required.',
          });

          // Try one more time to enqueue the retry job
          try {
            const { queueManager } = await import('../../queue/queue.manager');
            const finalAmountNgnCalc = amountNgn.minus(totalGasFeeNgn);
            const finalAmountNgnCalcDecimal = finalAmountNgnCalc.greaterThan(0) ? finalAmountNgnCalc : new Decimal('0');

            await queueManager.addJob(
              'tatum',
              'retry-sell-token-transfer',
              {
                userId,
                depositAddress,
                masterWalletAddress: masterWalletAddress || '',
                amount: amountCryptoDecimal.toString(),
                currency: currency.toUpperCase(),
                blockchain: blockchain.toLowerCase(),
                virtualAccountId: virtualAccount.id,
                fiatWalletId: fiatWallet.id,
                amountNgn: finalAmountNgnCalcDecimal.toString(),
                ethTransferTxHash,
                ethAmountSent: ethToSend.toString(),
                attemptNumber: 1,
              },
              {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 10000,
                },
              }
            );
            console.log('[CRYPTO SELL] Successfully enqueued retry job from catch block');
          } catch (queueError: any) {
            console.error('[CRYPTO SELL] Failed to enqueue retry job from catch block:', queueError);
          }
        }

        throw error;
      }
    } */

    // Calculate final amount after gas fees
    const finalAmountNgn = amountNgn.minus(totalGasFeeNgn);
    const finalAmountNgnDecimal = finalAmountNgn.greaterThan(0) ? finalAmountNgn : new Decimal('0');

    if (finalAmountNgnDecimal.lessThanOrEqualTo(0)) {
      throw new Error('Amount after gas fees is zero or negative. Gas fees exceed the sell amount.');
    }

    // fiatWallet already retrieved earlier (before blockchain transfers) for retry job enqueue
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

      // Send notifications
      try {
        await sendPushNotification({
          userId,
          title: 'Crypto Sale Successful',
          body: `You successfully sold ${amountCryptoDecimal.toString()} ${currency.toUpperCase()} for NGN${finalAmountNgnDecimal.toString()}`,
          sound: 'default',
          priority: 'high',
        });

        await tx.inAppNotification.create({
          data: {
            userId,
            title: 'Crypto Sale Successful',
            description: `You successfully sold ${amountCryptoDecimal.toString()} ${currency.toUpperCase()} for NGN${finalAmountNgnDecimal.toString()}. Transaction ID: ${transactionId}`,
            type: InAppNotificationType.customeer,
          },
        });

        cryptoLogger.info('Sell transaction notification sent', { userId, transactionId });
      } catch (notifError: any) {
        cryptoLogger.exception('Send sell notification', notifError, { userId, transactionId });
        // Don't fail the transaction if notification fails
      }

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

    // Get wallet currency - allow any currency/blockchain combination that exists
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

    // Get wallet currency - allow any currency/blockchain combination that exists
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

    // Initialize gas fee variables - SIMULATED
    let totalGasFeeEth = new Decimal('0');
    let totalGasFeeUsd = new Decimal('0');
    let totalGasFeeNgn = new Decimal('10'); // Simulated minimum gas fee in NGN
    let needsEthTransfer = false;
    let ethTransferGasFeeNgn = new Decimal('0');
    let tokenTransferGasFeeNgn = new Decimal('10'); // Simulated
    let ethNeededForGas = new Decimal('0');
    let ethNeededNgn = new Decimal('0');
    let userEthBalance = new Decimal('0');
    let gasEstimate: any = null;
    
    // Initialize ETH transfer gas fee variables (outside if block for scope)
    let ethTransferGasFeeEth = new Decimal('0');
    let ethTransferGasFeeUsd = new Decimal('0');
    let ethGasLimit = 0;
    let ethGasPriceWei = '0';
    let ethToSendPreview: Decimal = new Decimal('0');

    // BLOCKCHAIN CODE COMMENTED OUT - Simulated gas fees only
    // For USDT ERC-20: Check ETH balance FIRST, then calculate gas fees
    // COMMENTED OUT: Real blockchain gas fee calculation
    /* if (blockchain.toLowerCase() === 'ethereum' && currency.toUpperCase() === 'USDT') {
      try {
        console.log('[CRYPTO SELL PREVIEW] Starting gas fee calculations for Ethereum USDT sell');
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

        // STEP 1: Check user's ETH balance FIRST (before any other calculations)
        console.log('[CRYPTO SELL PREVIEW] Step 1: Checking user ETH balance');
        try {
          const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          userEthBalance = new Decimal(userEthBalanceStr);
          console.log('[CRYPTO SELL PREVIEW] User ETH balance:', userEthBalance.toString());
        } catch (error: any) {
          console.error('[CRYPTO SELL PREVIEW] Error checking user ETH balance:', error);
          userEthBalance = new Decimal('0');
        }

        // STEP 2: Estimate gas fee for token transfer (user to master wallet)
        console.log('[CRYPTO SELL PREVIEW] Step 2: Estimating gas for token transfer');
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
        // Add a reasonable buffer: 50% of gas fee or 0.0001 ETH (0.1 mETH), whichever is higher
        // This accounts for gas price fluctuations and estimation differences
        const bufferAmount = Decimal.max(
          tokenGasFeeEth.mul(new Decimal('0.5')), // 50% of gas fee
          new Decimal('0.0001') // Minimum 0.1 mETH buffer
        );
        const minimumEthNeeded = tokenGasFeeEth.plus(bufferAmount);
        const toleranceBuffer = tokenGasFeeEth.mul(new Decimal('0.1')); // 10% tolerance for comparison
        const minimumEthWithTolerance = minimumEthNeeded.minus(toleranceBuffer);
        ethNeededForGas = minimumEthNeeded;

        // Only transfer ETH if user's balance is significantly below the required amount
        if (userEthBalance.lessThan(minimumEthWithTolerance)) {
          needsEthTransfer = true;
          console.log('[CRYPTO SELL PREVIEW] User does not have sufficient ETH, will need transfer');
          console.log('  User ETH balance:', userEthBalance.toString());
          console.log('  Minimum ETH needed:', minimumEthNeeded.toString());
          console.log('  Minimum with tolerance:', minimumEthWithTolerance.toString());

          // Estimate gas for ETH transfer (master wallet to user)
          // Calculate how much ETH to send: minimum needed + small safety margin
          ethToSendPreview = minimumEthNeeded.plus(new Decimal('0.0001')); // Small safety margin (0.1 mETH)
          
          // STEP 3: Calculate ETH transfer gas fee (with buffer) and convert to USD → NGN
          console.log('[CRYPTO SELL PREVIEW] Step 3: Estimating gas for ETH transfer to user');
          console.log('  ETH to send (preview):', ethToSendPreview.toString());
          const ethTransferGasEstimate = await ethereumGasService.estimateGasFee(
            masterWallet.address,
            depositAddress,
            ethToSendPreview.toString(),
            false // mainnet
          );

          ethGasLimit = parseInt(ethTransferGasEstimate.gasLimit);
          ethGasLimit = Math.ceil(ethGasLimit * 1.1); // Add 10% buffer for ETH transfer

          ethGasPriceWei = ethTransferGasEstimate.gasPrice;
          ethTransferGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
            ethGasLimit.toString(),
            ethGasPriceWei
          ));

          // Convert ETH transfer gas fee: ETH → USD → NGN
          // Step 1: ETH to USD (using ETH price)
          ethTransferGasFeeUsd = ethTransferGasFeeEth.mul(ethPrice);
          // Step 2: USD to NGN (using USD to NGN rate from quote)
          ethTransferGasFeeNgn = ethTransferGasFeeUsd.mul(new Decimal(quote.rateUsdToNgn));

          console.log('[CRYPTO SELL PREVIEW] ETH transfer gas fee (with buffer):', {
            gasLimit: ethGasLimit,
            gasPrice: {
              wei: ethGasPriceWei,
              gwei: ethereumGasService.weiToGwei(ethGasPriceWei),
            },
            gasFeeEth: ethTransferGasFeeEth.toString(),
            gasFeeUsd: ethTransferGasFeeUsd.toString(),
            gasFeeNgn: ethTransferGasFeeNgn.toString(),
            conversion: {
              ethPriceUsd: ethPrice.toString(),
              usdToNgnRate: quote.rateUsdToNgn,
            },
          });

          // Convert ETH amount needed to NGN: ETH → USD → NGN
          const ethNeededUsd = ethNeededForGas.mul(ethPrice);
          ethNeededNgn = ethNeededUsd.mul(new Decimal(quote.rateUsdToNgn));
          console.log('[CRYPTO SELL PREVIEW] ETH amount needed for gas (converted to NGN):', {
            eth: ethNeededForGas.toString(),
            usd: ethNeededUsd.toString(),
            ngn: ethNeededNgn.toString(),
          });
        } else {
          console.log('[CRYPTO SELL PREVIEW] User has sufficient ETH balance');
        }

        // Calculate total gas fees
        // If ETH transfer is needed: ETH transfer gas fee + token transfer gas fee
        // If no ETH transfer: only token transfer gas fee
        if (needsEthTransfer) {
          // Total gas in ETH: ETH transfer gas fee + token transfer gas fee
          totalGasFeeEth = ethTransferGasFeeEth.plus(tokenGasFeeEth);
          // Total gas in USD: already calculated separately and summed
          totalGasFeeUsd = ethTransferGasFeeUsd.plus(tokenGasFeeUsd);
          // Total gas in NGN: already calculated separately and summed
          totalGasFeeNgn = ethTransferGasFeeNgn.plus(tokenTransferGasFeeNgn);
        } else {
          // Only token transfer gas
          totalGasFeeEth = tokenGasFeeEth;
          totalGasFeeUsd = tokenGasFeeUsd;
          totalGasFeeNgn = tokenTransferGasFeeNgn;
        }

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
          ethTransfer: needsEthTransfer ? {
            gasLimit: ethGasLimit.toString(),
            gasPrice: {
              wei: ethGasPriceWei,
              gwei: ethereumGasService.weiToGwei(ethGasPriceWei),
            },
            gasFeeEth: ethTransferGasFeeEth.toString(),
            gasFeeUsd: ethTransferGasFeeUsd.toString(),
            gasFeeNgn: ethTransferGasFeeNgn.toString(),
          } : null,
          needsEthTransfer,
          userEthBalance: userEthBalance.toString(),
          ethNeededForGas: ethNeededForGas.toString(),
          ethNeededUsd: needsEthTransfer ? ethNeededForGas.mul(ethPrice).toString() : '0',
          ethNeededNgn: needsEthTransfer ? ethNeededNgn.toString() : '0',
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
    } */

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
        ethTransfer: gasEstimate?.ethTransfer || null,
        needsEthTransfer: needsEthTransfer,
        userEthBalance: userEthBalance.toString(),
        ethNeededForGas: ethNeededForGas.toString(),
        ethNeededUsd: gasEstimate?.ethNeededUsd || '0',
        ethNeededNgn: ethNeededNgn.toString(),
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
   * Get all available currencies for selling
   * Shows all currencies from wallet_currencies table
   * For USDT variants, combines them into a single "USDT" entry with total balance
   */
  async getAvailableCurrenciesForSell(userId: number) {
    // Get all wallet currencies (all supported currencies)
    const allWalletCurrencies = await prisma.walletCurrency.findMany({
      where: {
        price: { not: null },
      },
      orderBy: [
        { isToken: 'asc' }, // Native coins first
        { currency: 'asc' },
      ],
    });

    // Get user's virtual accounts with balances
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId,
      },
      include: {
        walletCurrency: true,
      },
    });

    // Create a map of currency+blockchain to balance
    const balanceMap = new Map<string, Decimal>();
    virtualAccounts.forEach((va) => {
      const key = `${va.currency}_${va.blockchain}`;
      balanceMap.set(key, new Decimal(va.availableBalance));
    });

    // Group currencies: combine USDT variants, keep others separate
    const currencyMap = new Map<string, {
      id: number;
      currency: string;
      blockchain: string;
      name: string;
      symbol: string | null;
      price: Decimal;
      nairaPrice: Decimal | null;
      isToken: boolean;
      tokenType: string | null;
      blockchainName: string | null;
      availableBalance: Decimal;
      virtualAccountIds: number[];
      displayName: string;
      availableBlockchains?: Array<{ blockchain: string; balance: string; virtualAccountId: number | null }>; // For USDT
    }>();

    for (const walletCurrency of allWalletCurrencies) {
      const currencyUpper = walletCurrency.currency.toUpperCase();
      const isUsdtVariant = currencyUpper === 'USDT' || currencyUpper.startsWith('USDT_');
      
      if (isUsdtVariant) {
        // Combine all USDT variants into single "USDT" entry
        const key = 'USDT';
        const balanceKey = `${walletCurrency.currency}_${walletCurrency.blockchain}`;
        const balance = balanceMap.get(balanceKey) || new Decimal(0);
        const va = virtualAccounts.find(v => 
          v.currency === walletCurrency.currency && 
          v.blockchain === walletCurrency.blockchain
        );
        
        if (currencyMap.has(key)) {
          // Add to existing USDT entry
          const existing = currencyMap.get(key)!;
          existing.availableBalance = existing.availableBalance.plus(balance);
          // Add virtual account ID if balance > 0
          if (balance.gt(0) && va && !existing.virtualAccountIds.includes(va.id)) {
            existing.virtualAccountIds.push(va.id);
          }
          // Add blockchain info
          if (!existing.availableBlockchains) {
            existing.availableBlockchains = [];
          }
          existing.availableBlockchains.push({
            blockchain: walletCurrency.blockchain,
            balance: balance.toString(),
            virtualAccountId: va?.id || null,
          });
        } else {
          // Create new USDT entry
          currencyMap.set(key, {
            id: walletCurrency.id,
            currency: 'USDT',
            blockchain: walletCurrency.blockchain, // Use first blockchain found
            name: 'USDT',
            symbol: walletCurrency.symbol,
            price: walletCurrency.price || new Decimal(0),
            nairaPrice: walletCurrency.nairaPrice,
            isToken: true,
            tokenType: walletCurrency.tokenType,
            blockchainName: 'Multi-Chain', // Indicate it's multi-chain
            availableBalance: balance,
            virtualAccountIds: balance.gt(0) && va ? [va.id] : [],
            displayName: 'USDT',
            availableBlockchains: [{
              blockchain: walletCurrency.blockchain,
              balance: balance.toString(),
              virtualAccountId: va?.id || null,
            }],
          });
        }
      } else {
        // Other currencies: show individually
        const key = `${walletCurrency.currency}_${walletCurrency.blockchain}`;
        const balance = balanceMap.get(key) || new Decimal(0);
        const va = virtualAccounts.find(v => 
          v.currency === walletCurrency.currency && 
          v.blockchain === walletCurrency.blockchain
        );
        
        currencyMap.set(key, {
          id: walletCurrency.id,
          currency: walletCurrency.currency,
          blockchain: walletCurrency.blockchain,
          name: walletCurrency.name,
          symbol: walletCurrency.symbol,
          price: walletCurrency.price || new Decimal(0),
          nairaPrice: walletCurrency.nairaPrice,
          isToken: walletCurrency.isToken,
          tokenType: walletCurrency.tokenType,
          blockchainName: walletCurrency.blockchainName,
          availableBalance: balance,
          virtualAccountIds: balance.gt(0) && va ? [va.id] : [],
          displayName: `${walletCurrency.currency}${walletCurrency.isToken ? ` (${walletCurrency.blockchainName || walletCurrency.blockchain})` : ''}`,
        });
      }
    }

    // Convert to array and format
    const availableCurrencies = Array.from(currencyMap.values())
      .map((item) => ({
        id: item.id,
        currency: item.currency,
        blockchain: item.blockchain,
        name: item.name,
        symbol: item.symbol,
        price: item.price.toString(),
        nairaPrice: item.nairaPrice?.toString() || '0',
        isToken: item.isToken,
        tokenType: item.tokenType,
        blockchainName: item.blockchainName,
        availableBalance: item.availableBalance.toString(),
        virtualAccountId: item.virtualAccountIds.length > 0 ? item.virtualAccountIds[0] : null, // Return first VA ID for USDT
        virtualAccountIds: item.virtualAccountIds, // Include all VA IDs for USDT
        displayName: item.displayName,
        availableBlockchains: item.availableBlockchains, // For USDT: list of available blockchains with balances
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

