/**
 * Retry Sell Token Transfer Job
 * 
 * Retries USDT token transfer after ETH transfer has succeeded
 * Used when native funds haven't settled immediately
 */

import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ethereumTransactionService } from '../../services/ethereum/ethereum.transaction.service';
import { ethereumGasService } from '../../services/ethereum/ethereum.gas.service';
import { ethereumBalanceService } from '../../services/ethereum/ethereum.balance.service';
import cryptoLogger from '../../utils/crypto.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

export interface RetrySellTokenTransferJobData {
  userId: number;
  depositAddress: string;
  masterWalletAddress: string;
  amount: string; // USDT amount to transfer
  currency: string; // 'USDT'
  blockchain: string; // 'ethereum'
  virtualAccountId: number;
  fiatWalletId: string;
  amountNgn: string; // Final NGN amount user should receive
  ethTransferTxHash: string; // ETH transfer transaction hash
  ethAmountSent: string; // Amount of ETH sent to user
  attemptNumber: number; // Current attempt number (1, 2, or 3)
  sellTransactionId?: string; // Optional: if a transaction record was created
}

/**
 * Decrypt private key helper
 */
function decryptPrivateKey(encryptedKey: string): string {
  const crypto = require('crypto');
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

/**
 * Process retry sell token transfer job
 * Retries the USDT token transfer from user wallet to master wallet
 */
export async function processRetrySellTokenTransferJob(
  job: Job<RetrySellTokenTransferJobData>
): Promise<void> {
  const {
    userId,
    depositAddress,
    masterWalletAddress,
    amount,
    currency,
    blockchain,
    virtualAccountId,
    fiatWalletId,
    amountNgn,
    ethTransferTxHash,
    ethAmountSent,
    attemptNumber,
    sellTransactionId,
  } = job.data;

  // Update attempt number based on job attemptsMade (Bull tracks attempts)
  const currentAttempt = attemptNumber + (job.attemptsMade || 0);

  console.log(`[Queue:Tatum] Retry sell token transfer job (Attempt ${currentAttempt})`, {
    userId,
    depositAddress,
    amount,
    currency,
    ethTransferTxHash,
    jobId: job.id,
  });

  try {
    // Step 1: Check if user's ETH balance is sufficient now
    console.log(`[Queue:Tatum] Checking user ETH balance before retry attempt ${currentAttempt}`);
    const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
    const userEthBalance = new Decimal(userEthBalanceStr);
    
    // Get token gas fee estimation
    const tokenTransferGasEstimate = await ethereumGasService.estimateGasFee(
      depositAddress,
      masterWalletAddress,
      amount,
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

    // Add buffer for gas fee
    const bufferAmount = Decimal.max(
      tokenGasFeeEth.mul(new Decimal('0.5')),
      new Decimal('0.0001')
    );
    const minimumEthNeeded = tokenGasFeeEth.plus(bufferAmount);

    console.log(`[Queue:Tatum] ETH balance check for retry ${currentAttempt}:`, {
      userBalance: userEthBalance.toString(),
      minimumNeeded: minimumEthNeeded.toString(),
      sufficient: userEthBalance.gte(minimumEthNeeded),
    });

    if (userEthBalance.lessThan(minimumEthNeeded)) {
      const error = new Error(`Insufficient ETH balance for token transfer. Balance: ${userEthBalance.toString()}, Required: ${minimumEthNeeded.toString()}`);
      console.error(`[Queue:Tatum] Retry ${currentAttempt} failed:`, error.message);
      
      // If this is the last attempt, notify user
      if (currentAttempt >= 3) {
        await notifyUserToContactAdmin(userId, depositAddress, ethTransferTxHash, amount, currency);
      }
      
      throw error; // This will trigger Bull's retry mechanism
    }

    // Step 2: Get user's private key
    const depositAddressRecord = await prisma.depositAddress.findFirst({
      where: {
        address: depositAddress,
        virtualAccountId: virtualAccountId,
      },
    });

    if (!depositAddressRecord || !depositAddressRecord.privateKey) {
      throw new Error('Deposit address private key not found');
    }

    let userPrivateKey = decryptPrivateKey(depositAddressRecord.privateKey);
    userPrivateKey = userPrivateKey.trim();
    if (userPrivateKey.startsWith('0x')) {
      userPrivateKey = userPrivateKey.substring(2).trim();
    }

    if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
      throw new Error('Invalid user private key format');
    }

    // Step 3: Attempt token transfer
    console.log(`[Queue:Tatum] Attempting token transfer (retry ${currentAttempt})`);
    const tokenTransferTxHash = await ethereumTransactionService.sendTransaction(
      masterWalletAddress,
      amount,
      currency,
      userPrivateKey,
      ethereumGasService.weiToGwei(tokenGasPriceWei),
      tokenGasLimit.toString(),
      false // mainnet
    );

    if (!tokenTransferTxHash) {
      throw new Error('Token transfer failed: No transaction hash returned');
    }

    console.log(`[Queue:Tatum] Token transfer succeeded on retry ${currentAttempt}:`, tokenTransferTxHash);
    cryptoLogger.transfer('TOKEN_TRANSFER_SUCCESS_RETRY', {
      userId,
      from: depositAddress,
      to: masterWalletAddress,
      amount,
      currency,
      txHash: tokenTransferTxHash,
      attemptNumber: currentAttempt,
      ethTransferTxHash,
    });

    // Step 4: Complete the sell transaction in database
    await completeSellTransaction({
      userId,
      virtualAccountId,
      fiatWalletId,
      amountCrypto: amount,
      amountNgn,
      currency,
      blockchain,
      tokenTransferTxHash,
      ethTransferTxHash,
      sellTransactionId,
      depositAddress,
      masterWalletAddress,
    });

    console.log(`[Queue:Tatum] Sell transaction completed successfully on retry ${currentAttempt}`);

  } catch (error: any) {
    console.error(`[Queue:Tatum] Retry ${currentAttempt} failed:`, error);
    cryptoLogger.exception('Retry sell token transfer', error, {
      userId,
      depositAddress,
      amount,
      currency,
      attemptNumber: currentAttempt,
      ethTransferTxHash,
      jobId: job.id,
    });

    // If this is the last attempt, notify user
    if (currentAttempt >= 3) {
      await notifyUserToContactAdmin(userId, depositAddress, ethTransferTxHash, amount, currency);
    }

    throw error; // Re-throw to let Bull handle retries
  }
}

/**
 * Complete the sell transaction in database
 */
async function completeSellTransaction(data: {
  userId: number;
  virtualAccountId: number;
  fiatWalletId: string;
  amountCrypto: string;
  amountNgn: string;
  currency: string;
  blockchain: string;
  tokenTransferTxHash: string;
  ethTransferTxHash: string;
  sellTransactionId?: string;
  depositAddress?: string;
  masterWalletAddress?: string;
}) {
  const {
    userId,
    virtualAccountId,
    fiatWalletId,
    amountCrypto,
    amountNgn,
    currency,
    blockchain,
    tokenTransferTxHash,
    ethTransferTxHash,
    sellTransactionId,
    depositAddress: depositAddressFromData,
    masterWalletAddress: masterWalletAddressFromData,
  } = data;

  return await prisma.$transaction(async (tx) => {
    // Get virtual account and fiat wallet with locking
    const virtualAccount = await tx.virtualAccount.findUnique({
      where: { id: virtualAccountId },
    });

    const fiatWallet = await tx.fiatWallet.findUnique({
      where: { id: fiatWalletId },
    });

    if (!virtualAccount || !fiatWallet) {
      throw new Error('Virtual account or fiat wallet not found');
    }

    // Calculate balances
    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
    const amountCryptoDecimal = new Decimal(amountCrypto);
    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);

    const fiatBalanceBefore = new Decimal(fiatWallet.balance);
    const amountNgnDecimal = new Decimal(amountNgn);
    const fiatBalanceAfter = fiatBalanceBefore.plus(amountNgnDecimal);

    // Debit virtual account (crypto)
    await tx.virtualAccount.update({
      where: { id: virtualAccountId },
      data: {
        availableBalance: cryptoBalanceAfter.toString(),
        accountBalance: cryptoBalanceAfter.toString(),
      },
    });

    // Create fiat transaction
    const fiatTransaction = await tx.fiatTransaction.create({
      data: {
        userId,
        walletId: fiatWalletId,
        type: 'CRYPTO_SELL',
        status: 'pending',
        currency: 'NGN',
        amount: amountNgnDecimal,
        fees: new Decimal('0'),
        totalAmount: amountNgnDecimal,
        balanceBefore: fiatBalanceBefore,
        description: `Sell ${amountCrypto} ${currency}`,
      },
    });

    // Credit fiat wallet
    await tx.fiatWallet.update({
      where: { id: fiatWalletId },
      data: { balance: fiatBalanceAfter },
    });

    // Update fiat transaction
    await tx.fiatTransaction.update({
      where: { id: fiatTransaction.id },
      data: {
        balanceAfter: fiatBalanceAfter,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Create or update crypto transaction record
    let transactionId = sellTransactionId;
    if (!transactionId) {
      transactionId = `SELL-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Check if transaction already exists
    const existingTx = await tx.cryptoTransaction.findUnique({
      where: { transactionId },
    });

    if (existingTx) {
      // Update existing transaction
      await tx.cryptoTransaction.update({
        where: { id: existingTx.id },
        data: {
          status: 'successful',
        },
      });

      // Update CryptoSell record
      await tx.cryptoSell.update({
        where: { cryptoTransactionId: existingTx.id },
        data: {
          txHash: tokenTransferTxHash,
        },
      });
    } else {
      // Create new transaction
      const walletCurrency = await tx.walletCurrency.findFirst({
        where: {
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
        },
      });

      const cryptoPrice = walletCurrency?.price ? new Decimal(walletCurrency.price.toString()) : new Decimal('1');
      const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

      // Get USD to NGN rate (CryptoRate doesn't have fromCurrency/toCurrency, just transactionType)
      const cryptoRate = await tx.cryptoRate.findFirst({
        where: {
          transactionType: 'SELL',
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const usdToNgnRate = cryptoRate?.rate ? new Decimal(cryptoRate.rate.toString()) : new Decimal('1400');

      await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId,
          transactionType: 'SELL',
          transactionId,
          status: 'successful',
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
          cryptoSell: {
            create: {
              fromAddress: depositAddressFromData || null,
              toAddress: masterWalletAddressFromData || null,
              amount: amountCryptoDecimal,
              amountUsd,
              amountNaira: amountNgnDecimal,
              rateCryptoToUsd: cryptoPrice,
              rateUsdToNgn: usdToNgnRate,
              txHash: tokenTransferTxHash,
            },
          },
        },
      });
    }
  });
}

/**
 * Notify user to contact admin after max retries
 */
async function notifyUserToContactAdmin(
  userId: number,
  depositAddress: string,
  ethTransferTxHash: string,
  amount: string,
  currency: string
) {
  try {
    console.log(`[Queue:Tatum] Sending notification to user ${userId} to contact admin`);

    // Send push notification
    await sendPushNotification({
      userId,
      title: 'Transaction Assistance Required',
      body: `Your ${currency} sell transaction needs manual processing. Please contact support with transaction ID: ${ethTransferTxHash.substring(0, 10)}...`,
      data: {
        type: 'sell_retry_failed',
        depositAddress,
        ethTransferTxHash,
        amount,
        currency,
      },
    });

    // Create in-app notification
    await prisma.inAppNotification.create({
      data: {
        userId,
        type: InAppNotificationType.customeer,
        title: 'Transaction Assistance Required',
        description: `Your ${currency} sell transaction needs manual processing. Please contact support with transaction ID: ${ethTransferTxHash}`,
        isRead: false,
      },
    });

    console.log(`[Queue:Tatum] Notification sent to user ${userId}`);
  } catch (error: any) {
    console.error(`[Queue:Tatum] Failed to send notification to user ${userId}:`, error);
    // Don't throw - notification failure shouldn't block the job
  }
}

