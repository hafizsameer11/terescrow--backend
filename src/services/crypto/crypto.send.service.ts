/**
 * Crypto Send Service
 * 
 * Handles external crypto send operations:
 * - Validates user crypto balance
 * - Checks native ETH balance (for USDT transfers)
 * - Calculates gas fees
 * - Executes blockchain transfers to external addresses
 * - Creates transaction records
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import cryptoTransactionService from './crypto.transaction.service';
import cryptoLogger from '../../utils/crypto.logger';

export interface SendCryptoInput {
  userId: number;
  amount: number; // Amount in crypto currency (e.g., 6 USDT, 0.001 ETH)
  currency: string; // Crypto currency to send (e.g., ETH, USDT)
  blockchain: string; // Blockchain (e.g., ethereum)
  toAddress: string; // Recipient address
}

export interface SendCryptoResult {
  transactionId: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  txHash: string;
  networkFee: string;
  virtualAccountId: number;
  balanceBefore: string;
  balanceAfter: string;
}

class CryptoSendService {
  /**
   * Send cryptocurrency to external address
   * 
   * Flow:
   * 1. Validate user has sufficient crypto balance
   * 2. Check native ETH balance (if sending USDT)
   * 3. Calculate gas fees
   * 4. Debit virtual account
   * 5. Execute blockchain transfer
   * 6. Create transaction record
   */
  async sendCrypto(input: SendCryptoInput): Promise<SendCryptoResult> {
    const { userId, amount, currency, blockchain, toAddress } = input;

    // Only Ethereum blockchain is currently supported
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto send for ${blockchain} blockchain is not active yet. Only Ethereum (ETH and USDT) is currently supported.`);
    }

    // Normalize currency (handle formats like "USDT ETH" -> "USDT")
    const normalizedCurrency = currency.toUpperCase().split(' ')[0]; // Take first word (e.g., "USDT ETH" -> "USDT")
    
    // Only ETH and USDT are currently supported
    if (normalizedCurrency !== 'ETH' && normalizedCurrency !== 'USDT') {
      throw new Error(`Crypto send for ${currency} on ${blockchain} is not active yet. Only ETH and USDT on Ethereum are currently supported.`);
    }
    
    // Use normalized currency for rest of the function
    const currencyCode = normalizedCurrency;

    // Validate recipient address format
    if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
      throw new Error('Invalid recipient address. Must be a valid Ethereum address (0x...).');
    }

    console.log('\n========================================');
    console.log('[CRYPTO SEND] Starting send transaction');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('To Address:', toAddress);
    console.log('========================================\n');

    // Get user's virtual account for this crypto with deposit address
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currencyCode,
        blockchain: blockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        walletCurrency: true,
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
    }

    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;
    if (!depositAddress) {
      throw new Error(`Deposit address not found for ${currency} on ${blockchain}. Please contact support.`);
    }

    const depositAddressRecord = virtualAccount.depositAddresses[0];
    if (!depositAddressRecord || !depositAddressRecord.privateKey) {
      throw new Error('Deposit address private key not found');
    }

    // Get wallet currency for price and contract address
    const walletCurrency = virtualAccount.walletCurrency;
    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currency} price not set`);
    }

    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCryptoDecimal = new Decimal(amount);
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // STEP 1: Check REAL on-chain balance before proceeding
    console.log('[CRYPTO SEND] Checking on-chain balance before send');
    let onChainBalance = new Decimal('0');
    
    // Initialize variables for gas fees and transaction hash
    let gasFeeEth = new Decimal('0');
    let gasFeeUsd = new Decimal('0');
    let txHash: string | null = null;

    // For Ethereum: Check on-chain balance and calculate gas fees
    if (blockchain.toLowerCase() === 'ethereum') {
      const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
      
      // Check REAL on-chain balance
      try {
        if (currencyCode === 'ETH') {
          // Check native ETH balance
          const ethBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          onChainBalance = new Decimal(ethBalanceStr);
          console.log('[CRYPTO SEND] On-chain ETH balance:', onChainBalance.toString());
        } else if (currencyCode === 'USDT') {
          // Check USDT token balance
          if (!walletCurrency.contractAddress) {
            throw new Error(`USDT contract address not configured in database`);
          }
          const usdtBalanceStr = await ethereumBalanceService.getERC20Balance(
            walletCurrency.contractAddress,
            depositAddress,
            walletCurrency.decimals || 6,
            false
          );
          onChainBalance = new Decimal(usdtBalanceStr);
          console.log('[CRYPTO SEND] On-chain USDT balance:', onChainBalance.toString());
        }
        
        // Update virtual account to match on-chain balance if different
        const virtualBalance = new Decimal(virtualAccount.availableBalance || '0');
        if (!onChainBalance.equals(virtualBalance)) {
          console.log('[CRYPTO SEND] Virtual account balance mismatch detected:', {
            virtualBalance: virtualBalance.toString(),
            onChainBalance: onChainBalance.toString(),
            difference: onChainBalance.minus(virtualBalance).toString(),
          });
          
          // Update virtual account to match on-chain balance
          await prisma.virtualAccount.update({
            where: { id: virtualAccount.id },
            data: {
              availableBalance: onChainBalance.toString(),
              accountBalance: onChainBalance.toString(),
            },
          });
          
          console.log('[CRYPTO SEND] Virtual account updated to match on-chain balance');
          
          // Refresh virtual account object
          const updated = await prisma.virtualAccount.findUnique({
            where: { id: virtualAccount.id },
          });
          if (updated) {
            Object.assign(virtualAccount, updated);
          }
        }
      } catch (error: any) {
        console.error('[CRYPTO SEND] Error checking on-chain balance:', error);
        throw new Error(`Failed to verify on-chain balance: ${error.message || 'Unknown error'}`);
      }
      
      // Validate user has sufficient on-chain balance
      if (onChainBalance.lessThan(amountCryptoDecimal)) {
        throw new Error(`Insufficient ${currency} balance on-chain. Available: ${onChainBalance.toString()}, Required: ${amountCryptoDecimal.toString()}`);
      }

      const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');
      const { ethereumTransactionService } = await import('../ethereum/ethereum.transaction.service');

      // Check user's ETH balance (required for gas)
      let userEthBalance = new Decimal('0');
      try {
        const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
        userEthBalance = new Decimal(userEthBalanceStr);
        console.log('[CRYPTO SEND] User ETH balance:', userEthBalance.toString());
      } catch (error: any) {
        console.error('[CRYPTO SEND] Error checking user ETH balance:', error);
        userEthBalance = new Decimal('0');
      }

      // Estimate gas fee
      let gasLimit = 21000; // Default for ETH transfer
      if (currencyCode === 'USDT') {
        gasLimit = 65000; // ERC-20 token transfer
        gasLimit = Math.ceil(gasLimit * 1.2); // Add 20% buffer
      } else {
        gasLimit = Math.ceil(gasLimit * 1.1); // Add 10% buffer for ETH
      }

      const gasEstimate = await ethereumGasService.estimateGasFee(
        depositAddress,
        toAddress,
        amountCryptoDecimal.toString(),
        false // mainnet
      );

      const gasPriceWei = gasEstimate.gasPrice;
      gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(gasLimit.toString(), gasPriceWei));

      // Get ETH price for converting gas fees to USD
      const ethWalletCurrency = await prisma.walletCurrency.findFirst({
        where: { currency: 'ETH', blockchain: 'ethereum' },
      });
      let ethPrice = new Decimal('0');
      if (ethWalletCurrency?.price) {
        ethPrice = new Decimal(ethWalletCurrency.price.toString());
      }
      gasFeeUsd = gasFeeEth.mul(ethPrice);

      console.log('[CRYPTO SEND] Gas fee estimate:', {
        gasLimit,
        gasPriceGwei: ethereumGasService.weiToGwei(gasPriceWei),
        gasFeeEth: gasFeeEth.toString(),
        gasFeeUsd: gasFeeUsd.toString(),
      });

      // Check if user has enough ETH for gas
      const bufferAmount = Decimal.max(
        gasFeeEth.mul(new Decimal('0.5')), // 50% buffer
        new Decimal('0.0001') // Minimum 0.1 mETH buffer
      );
      const minimumEthNeeded = gasFeeEth.plus(bufferAmount);

      if (currencyCode === 'USDT') {
        // For USDT: Check if user has enough ETH for gas (separate from USDT amount)
        if (userEthBalance.lessThan(minimumEthNeeded)) {
          throw new Error(`Insufficient ETH for gas fees. You need at least ${minimumEthNeeded.toString()} ETH to send USDT, but you only have ${userEthBalance.toString()} ETH. Please buy some ETH first.`);
        }
      } else if (currencyCode === 'ETH') {
        // For ETH: Check if user has enough ETH for amount + gas fee
        const totalEthNeeded = amountCryptoDecimal.plus(minimumEthNeeded);
        if (userEthBalance.lessThan(totalEthNeeded)) {
          throw new Error(`Insufficient ETH balance. You need ${totalEthNeeded.toString()} ETH (${amountCryptoDecimal.toString()} + ${minimumEthNeeded.toString()} for gas), but you only have ${userEthBalance.toString()} ETH.`);
        }
      }

      // Execute blockchain transfer
      console.log('[CRYPTO SEND] Executing blockchain transfer');

      // Get and decrypt user's private key
      // Decrypt private key function (same as in sell service)
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

      let userPrivateKey = decryptPrivateKey(depositAddressRecord.privateKey);
      userPrivateKey = userPrivateKey.trim();
      if (userPrivateKey.startsWith('0x')) {
        userPrivateKey = userPrivateKey.substring(2).trim();
      }

      // Validate private key format
      if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
        throw new Error('Invalid user private key format');
      }

      try {
        txHash = await ethereumTransactionService.sendTransaction(
          toAddress,
          amountCryptoDecimal.toString(),
          currencyCode,
          userPrivateKey,
          ethereumGasService.weiToGwei(gasPriceWei),
          gasLimit.toString(),
          false // mainnet
        );

        console.log('[CRYPTO SEND] Blockchain transfer successful:', { txHash });
        cryptoLogger.transaction('SEND_COMPLETE', {
          transactionId: `SEND-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`,
          userId,
          currency: currencyCode,
          blockchain: blockchain.toLowerCase(),
          amountCrypto: amountCryptoDecimal.toString(),
          amountUsd: amountUsd.toString(),
          toAddress,
          txHash,
          gasFee: gasFeeEth.toString(),
          depositAddress,
        });
      } catch (error: any) {
        console.error('[CRYPTO SEND] Blockchain transfer failed:', error);
        cryptoLogger.exception('Blockchain transfer failed', error, {
          userId,
          currency: currencyCode,
          blockchain: blockchain.toLowerCase(),
          amount: amountCryptoDecimal.toString(),
          toAddress,
          note: 'Blockchain transfer failed - virtual account not debited.',
        });
        throw new Error(`Failed to send transaction: ${error.message || 'Unknown error'}`);
      }
    }

    // Calculate final balance after sending
    const balanceBefore = onChainBalance; // Use on-chain balance as the source of truth
    const balanceAfter = balanceBefore.minus(amountCryptoDecimal);

    // Generate transaction ID
    const transactionId = `SEND-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;

    // Create transaction record in database (with increased timeout for blockchain operations)
    await prisma.$transaction(async (tx) => {
      // Update virtual account to match expected on-chain balance after send
      await tx.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: balanceAfter.toString(),
          accountBalance: balanceAfter.toString(),
        },
      });

      // Create crypto transaction
      await cryptoTransactionService.createSendTransaction({
        userId,
        virtualAccountId: virtualAccount.id,
        transactionId,
        fromAddress: depositAddress,
        toAddress,
        amount: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        txHash: txHash || '',
        networkFee: gasFeeEth.toString(),
        status: txHash ? 'successful' : 'failed',
      });
    }, {
      maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
      timeout: 30000, // Maximum time the transaction can run (30 seconds - increased for blockchain operations)
    });

    // STEP 2: Verify on-chain balance after transaction (optional, but good for logging)
    if (txHash && blockchain.toLowerCase() === 'ethereum') {
      try {
        const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
        
        // Wait a bit for transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
        
        let actualOnChainBalance = new Decimal('0');
        if (currencyCode === 'ETH') {
          const ethBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          actualOnChainBalance = new Decimal(ethBalanceStr);
        } else if (currencyCode === 'USDT' && walletCurrency.contractAddress) {
          const usdtBalanceStr = await ethereumBalanceService.getERC20Balance(
            walletCurrency.contractAddress,
            depositAddress,
            walletCurrency.decimals || 6,
            false
          );
          actualOnChainBalance = new Decimal(usdtBalanceStr);
        }
        
        console.log('[CRYPTO SEND] On-chain balance after transaction:', {
          expected: balanceAfter.toString(),
          actual: actualOnChainBalance.toString(),
          difference: actualOnChainBalance.minus(balanceAfter).toString(),
        });
        
        // Update virtual account to match actual on-chain balance if different
        if (!actualOnChainBalance.equals(balanceAfter)) {
          console.log('[CRYPTO SEND] Updating virtual account to match actual on-chain balance');
          await prisma.virtualAccount.update({
            where: { id: virtualAccount.id },
            data: {
              availableBalance: actualOnChainBalance.toString(),
              accountBalance: actualOnChainBalance.toString(),
            },
          });
        }
      } catch (error: any) {
        console.error('[CRYPTO SEND] Error verifying post-transaction balance (non-critical):', error);
        // Don't throw - this is just for verification
      }
    }

    console.log('[CRYPTO SEND] Transaction completed successfully:', {
      transactionId,
      txHash,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
    });

    return {
      transactionId,
      amount: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      txHash: txHash || '',
      networkFee: gasFeeEth.toString(),
      virtualAccountId: virtualAccount.id,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
    };
  }

  /**
   * Preview send transaction with complete details
   * Includes current balances, gas fees, and all transaction details
   */
  async previewSendTransaction(userId: number, amount: number, currency: string, blockchain: string, toAddress: string) {
    console.log('\n========================================');
    console.log('[CRYPTO SEND PREVIEW] Starting preview');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('To Address:', toAddress);
    console.log('========================================\n');

    // Only Ethereum blockchain is currently supported
    if (blockchain.toLowerCase() !== 'ethereum') {
      throw new Error(`Crypto send for ${blockchain} blockchain is not active yet. Only Ethereum (ETH and USDT) is currently supported.`);
    }

    // Validate recipient address format
    if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
      throw new Error('Invalid recipient address. Must be a valid Ethereum address (0x...).');
    }

    // Normalize currency (handle formats like "USDT ETH" -> "USDT")
    const normalizedCurrency = currency.toUpperCase().split(' ')[0]; // Take first word (e.g., "USDT ETH" -> "USDT")
    const currencyCode = normalizedCurrency;
    
    // Only ETH and USDT are currently supported
    if (currencyCode !== 'ETH' && currencyCode !== 'USDT') {
      throw new Error(`Crypto send for ${currency} on ${blockchain} is not active yet. Only ETH and USDT on Ethereum are currently supported.`);
    }

    // Get user's virtual account for this crypto with deposit address
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currencyCode,
        blockchain: blockchain.toLowerCase(),
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        walletCurrency: true,
      },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currencyCode} on ${blockchain}`);
    }

    const depositAddress = virtualAccount.depositAddresses[0]?.address || null;
    if (!depositAddress) {
      throw new Error(`Deposit address not found for ${currencyCode} on ${blockchain}. Please contact support.`);
    }

    // Get wallet currency for price and contract address
    const walletCurrency = virtualAccount.walletCurrency;
    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currencyCode} price not set`);
    }

    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCryptoDecimal = new Decimal(amount);
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    // STEP 1: Check REAL on-chain balance and sync virtual account
    console.log('[CRYPTO SEND PREVIEW] Checking on-chain balance');
    let onChainBalance = new Decimal('0');
    
    // Initialize gas fee variables
    let gasFeeEth = new Decimal('0');
    let gasFeeUsd = new Decimal('0');
    let userEthBalance = new Decimal('0');
    let hasSufficientEth = true;
    let gasEstimate: any = null;

    // For Ethereum: Check on-chain balance and calculate gas fees
    if (blockchain.toLowerCase() === 'ethereum') {
      const { ethereumBalanceService } = await import('../ethereum/ethereum.balance.service');
      const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

      // Check REAL on-chain balance
      try {
        if (currencyCode === 'ETH') {
          // Check native ETH balance
          const ethBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
          onChainBalance = new Decimal(ethBalanceStr);
          console.log('[CRYPTO SEND PREVIEW] On-chain ETH balance:', onChainBalance.toString());
        } else if (currencyCode === 'USDT') {
          // Check USDT token balance
          if (!walletCurrency.contractAddress) {
            throw new Error(`USDT contract address not configured in database`);
          }
          const usdtBalanceStr = await ethereumBalanceService.getERC20Balance(
            walletCurrency.contractAddress,
            depositAddress,
            walletCurrency.decimals || 6,
            false
          );
          onChainBalance = new Decimal(usdtBalanceStr);
          console.log('[CRYPTO SEND PREVIEW] On-chain USDT balance:', onChainBalance.toString());
        }
        
        // Update virtual account to match on-chain balance if different
        const virtualBalance = new Decimal(virtualAccount.availableBalance || '0');
        if (!onChainBalance.equals(virtualBalance)) {
          console.log('[CRYPTO SEND PREVIEW] Virtual account balance mismatch detected:', {
            virtualBalance: virtualBalance.toString(),
            onChainBalance: onChainBalance.toString(),
            difference: onChainBalance.minus(virtualBalance).toString(),
          });
          
          // Update virtual account to match on-chain balance
          await prisma.virtualAccount.update({
            where: { id: virtualAccount.id },
            data: {
              availableBalance: onChainBalance.toString(),
              accountBalance: onChainBalance.toString(),
            },
          });
          
          console.log('[CRYPTO SEND PREVIEW] Virtual account updated to match on-chain balance');
          
          // Refresh virtual account object
          const updated = await prisma.virtualAccount.findUnique({
            where: { id: virtualAccount.id },
          });
          if (updated) {
            Object.assign(virtualAccount, updated);
          }
        }
      } catch (error: any) {
        console.error('[CRYPTO SEND PREVIEW] Error checking on-chain balance:', error);
        // Use virtual account balance as fallback
        onChainBalance = new Decimal(virtualAccount.availableBalance || '0');
        console.warn('[CRYPTO SEND PREVIEW] Using virtual account balance as fallback:', onChainBalance.toString());
      }

      // Validate user has sufficient on-chain balance
      if (onChainBalance.lessThan(amountCryptoDecimal)) {
        throw new Error(`Insufficient ${currency} balance on-chain. Available: ${onChainBalance.toString()}, Required: ${amountCryptoDecimal.toString()}`);
      }

      // Check user's ETH balance (required for gas) - always check real-time
      try {
        const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
        userEthBalance = new Decimal(userEthBalanceStr);
        console.log('[CRYPTO SEND PREVIEW] User ETH balance (on-chain):', userEthBalance.toString());
      } catch (error: any) {
        console.error('[CRYPTO SEND PREVIEW] Error checking user ETH balance:', error);
        userEthBalance = new Decimal('0');
      }

      // Estimate gas fee
      let gasLimit = 21000; // Default for ETH transfer
      if (currencyCode === 'USDT') {
        gasLimit = 65000; // ERC-20 token transfer
        gasLimit = Math.ceil(gasLimit * 1.2); // Add 20% buffer
      } else {
        gasLimit = Math.ceil(gasLimit * 1.1); // Add 10% buffer for ETH
      }

      const gasEstimateResult = await ethereumGasService.estimateGasFee(
        depositAddress,
        toAddress,
        amountCryptoDecimal.toString(),
        false // mainnet
      );

      const gasPriceWei = gasEstimateResult.gasPrice;
      gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(gasLimit.toString(), gasPriceWei));

      // Get ETH price for converting gas fees to USD
      const ethWalletCurrency = await prisma.walletCurrency.findFirst({
        where: { currency: 'ETH', blockchain: 'ethereum' },
      });
      let ethPrice = new Decimal('0');
      if (ethWalletCurrency?.price) {
        ethPrice = new Decimal(ethWalletCurrency.price.toString());
      }
      gasFeeUsd = gasFeeEth.mul(ethPrice);

      // Check if user has enough ETH for gas
      const bufferAmount = Decimal.max(
        gasFeeEth.mul(new Decimal('0.5')), // 50% buffer
        new Decimal('0.0001') // Minimum 0.1 mETH buffer
      );
      const minimumEthNeeded = gasFeeEth.plus(bufferAmount);

      if (currencyCode === 'USDT') {
        // For USDT: Check if user has enough ETH for gas (separate from USDT amount)
        hasSufficientEth = userEthBalance.greaterThanOrEqualTo(minimumEthNeeded);

        if (!hasSufficientEth) {
          console.warn('[CRYPTO SEND PREVIEW] User does not have sufficient ETH for gas:', {
            userEthBalance: userEthBalance.toString(),
            minimumEthNeeded: minimumEthNeeded.toString(),
          });
        }
      } else if (currencyCode === 'ETH') {
        // For ETH: Check if user has enough ETH for amount + gas fee
        const totalEthNeeded = amountCryptoDecimal.plus(minimumEthNeeded);
        hasSufficientEth = userEthBalance.greaterThanOrEqualTo(totalEthNeeded);

        if (!hasSufficientEth) {
          console.warn('[CRYPTO SEND PREVIEW] User does not have sufficient ETH for amount + gas:', {
            userEthBalance: userEthBalance.toString(),
            amount: amountCryptoDecimal.toString(),
            gasFee: minimumEthNeeded.toString(),
            totalNeeded: totalEthNeeded.toString(),
          });
        }
      }

      gasEstimate = {
        gasLimit: gasLimit.toString(),
        gasPrice: {
          wei: gasPriceWei,
          gwei: ethereumGasService.weiToGwei(gasPriceWei),
        },
        gasFeeEth: gasFeeEth.toString(),
        gasFeeUsd: gasFeeUsd.toString(),
      };

      console.log('[CRYPTO SEND PREVIEW] Gas fee estimate:', gasEstimate);
    }

    // Calculate final balance after sending (use on-chain balance as source of truth)
    const balanceBefore = onChainBalance;
    const balanceAfter = balanceBefore.minus(amountCryptoDecimal);

    return {
      currency: currencyCode,
      blockchain: blockchain.toLowerCase(),
      currencyName: walletCurrency.name || currency,
      currencySymbol: walletCurrency.symbol || null,
      amount: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      fromAddress: depositAddress,
      gasFee: {
        eth: gasFeeEth.toString(),
        usd: gasFeeUsd.toString(),
        ...gasEstimate,
      },
      userEthBalance: userEthBalance.toString(),
      hasSufficientEth,
      cryptoBalanceBefore: balanceBefore.toString(),
      cryptoBalanceAfter: balanceAfter.toString(),
      hasSufficientBalance: true,
      canProceed: hasSufficientEth, // Can only proceed if has sufficient ETH for gas (for USDT)
      virtualAccountId: virtualAccount.id,
    };
  }
}

export default new CryptoSendService();

