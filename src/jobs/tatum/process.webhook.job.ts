/**
 * Process Blockchain Webhook Job
 * 
 * Processes incoming webhooks from Tatum
 */

import { prisma } from '../../utils/prisma';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import { TatumWebhookPayload } from '../../services/tatum/tatum.service';
import tatumLogger from '../../utils/tatum.logger';
import cryptoTransactionService from '../../services/crypto/crypto.transaction.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Process blockchain webhook from Tatum
 */
export async function processBlockchainWebhook(webhookData: TatumWebhookPayload | any) {
  try {
    // Handle address-based webhooks (INCOMING_NATIVE_TX, INCOMING_FUNGIBLE_TX, or legacy ADDRESS_EVENT)
    const isAddressWebhook = webhookData.subscriptionType === 'ADDRESS_EVENT' 
      || webhookData.subscriptionType === 'INCOMING_NATIVE_TX'
      || webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX';
    const webhookAddress = webhookData.address || webhookData.to || webhookData.counterAddress;
    
    // Check if webhook address matches any master wallet - IGNORE these
    // This handles address-based webhooks (ADDRESS_EVENT) where transactions involve master wallet
    if (webhookAddress) {
      // Normalize address to lowercase for comparison (Ethereum addresses are case-insensitive)
      const normalizedAddress = webhookAddress.toLowerCase();
      
      // Check all master wallets (typically only a few, so in-memory filter is fine)
      const allMasterWallets = await prisma.masterWallet.findMany({
        where: { address: { not: null } },
      });
      
      const masterWallet = allMasterWallets.find(
        mw => mw.address?.toLowerCase() === normalizedAddress
      );

      if (masterWallet) {
        tatumLogger.info(`Ignoring webhook from master wallet address: ${webhookAddress}`, {
          address: webhookAddress,
          normalizedAddress,
          subscriptionType: webhookData.subscriptionType,
          txId: webhookData.txId,
          masterWalletId: masterWallet.id,
          blockchain: masterWallet.blockchain,
        });
        return { processed: false, reason: 'master_wallet' };
      }
    }

    // Handle address-based webhooks (INCOMING_NATIVE_TX, INCOMING_FUNGIBLE_TX, or legacy ADDRESS_EVENT)
    // These webhooks don't have accountId, but we can find the deposit address by matching the address
    if (isAddressWebhook && !webhookData.accountId) {
      const addressTxId = webhookData.txId || webhookData.txHash;
      const webhookAddr = webhookData.address?.toLowerCase();
      const counterAddress = webhookData.counterAddress?.toLowerCase();
      
      // If no counterAddress, it's a send transaction - ignore (we handle sends synchronously)
      if (!counterAddress) {
        tatumLogger.info('Address-based webhook without counterAddress - ignoring (send transaction)', {
          address: webhookAddr,
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'send_transaction_ignore' };
      }
      
      // Has counterAddress - this is a RECEIVE transaction
      // Find deposit address by matching the webhook address
      if (!webhookAddr) {
        tatumLogger.warn('Address-based webhook missing address field', {
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'missing_address' };
      }
      
      // Find deposit address with case-insensitive matching
      const allDepositAddresses = await prisma.depositAddress.findMany({
        include: {
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
      });
      
      // Case-insensitive address matching
      const depositAddressRecord = allDepositAddresses.find(
        da => da.address.toLowerCase() === webhookAddr.toLowerCase()
      );
      
      if (!depositAddressRecord || !depositAddressRecord.virtualAccount) {
        tatumLogger.info('Address-based webhook - deposit address not found', {
          address: webhookAddr,
          txId: addressTxId,
          counterAddress,
        });
        return { processed: false, reason: 'deposit_address_not_found' };
      }
      
      // Process as receive transaction
      const addressVirtualAccount = depositAddressRecord.virtualAccount;
      const amountStr = webhookData.amount || '0';
      
      // Determine if this is a token transfer
      // For INCOMING_FUNGIBLE_TX, check contractAddress field
      // For ADDRESS_EVENT, check asset field and type
      const contractAddress = webhookData.contractAddress || webhookData.asset;
      const isFungibleToken = webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX' && contractAddress;
      const isToken = isFungibleToken || (contractAddress && contractAddress !== 'ETH' && webhookData.type === 'token');
      
      tatumLogger.info('Processing address-based webhook as receive transaction', {
        address: webhookAddr,
        counterAddress,
        amount: amountStr,
        contractAddress,
        subscriptionType: webhookData.subscriptionType,
        isToken,
        isFungibleToken,
        txId: addressTxId,
        virtualAccountId: addressVirtualAccount.id,
        userId: addressVirtualAccount.userId,
        currency: addressVirtualAccount.currency,
      });
      
      // Determine the correct currency based on contract address
      let detectedCurrency = addressVirtualAccount.currency;
      let targetVirtualAccount = addressVirtualAccount;
      
      // For token transfers, find the correct currency and virtual account
      if (isToken && contractAddress) {
        const walletCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: addressVirtualAccount.blockchain.toLowerCase(),
            contractAddress: { not: null },
          },
        });
        
        // Case-insensitive contract address matching
        const walletCurrency = walletCurrencies.find(
          wc => wc.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
        );
        
        if (walletCurrency) {
          detectedCurrency = walletCurrency.currency;
          
          // Find the correct virtual account for this currency
          const correctVirtualAccount = await prisma.virtualAccount.findFirst({
            where: {
              userId: addressVirtualAccount.userId,
              currency: walletCurrency.currency,
              blockchain: addressVirtualAccount.blockchain.toLowerCase(),
            },
            include: {
              walletCurrency: true,
            },
          });
          
          if (correctVirtualAccount) {
            targetVirtualAccount = correctVirtualAccount;
            tatumLogger.info('Found correct virtual account for token', {
              originalCurrency: addressVirtualAccount.currency,
              detectedCurrency: walletCurrency.currency,
              originalVirtualAccountId: addressVirtualAccount.id,
              targetVirtualAccountId: correctVirtualAccount.id,
              contractAddress,
            });
          } else {
            tatumLogger.warn('Virtual account not found for detected currency', {
              userId: addressVirtualAccount.userId,
              currency: walletCurrency.currency,
              blockchain: addressVirtualAccount.blockchain,
              contractAddress,
            });
          }
        }
      }
      
      // Process as receive - continue with normal flow using the correct virtualAccount
      // We'll set accountId to targetVirtualAccount.accountId for compatibility
      webhookData.accountId = targetVirtualAccount.accountId;
      webhookData.currency = detectedCurrency;
      // Set from and to addresses for address-based webhooks
      webhookData.from = counterAddress; // Sender
      webhookData.to = webhookAddr; // Receiver (our deposit address)
      
      // IMPORTANT: Check for duplicates and save WebhookResponse EARLY to "claim" this webhook
      // This must happen AFTER we've set up all the webhook data but BEFORE processing
      // This prevents race conditions where multiple webhooks arrive simultaneously
      if (addressTxId) {
        // Check for existing RECEIVE transaction (the real indicator that it's been processed)
        // Note: We only check for CryptoReceive, not CryptoSend, because a receive webhook
        // should only be blocked if we've already processed this receive transaction,
        // not if there's a send transaction with the same txHash
        // We don't check WebhookResponse because it might exist from a failed previous attempt
        const existingReceiveTx = await prisma.cryptoTransaction.findFirst({
          where: {
            transactionType: 'RECEIVE',
            cryptoReceive: { 
              txHash: addressTxId 
            }
          },
          include: {
            cryptoReceive: true,
          },
        });
        
        if (existingReceiveTx) {
          tatumLogger.info('Address-based webhook already processed (receive transaction exists)', {
            txId: addressTxId,
            address: webhookAddr,
            counterAddress,
            existingReceiveTxId: existingReceiveTx.id,
            transactionType: existingReceiveTx.transactionType,
          });
          return { processed: false, reason: 'duplicate_tx' };
        }
        
        // Save WebhookResponse EARLY to "claim" this webhook and prevent other processes from handling it
        // This must happen before we continue with processing to prevent race conditions
        const timestamp = webhookData.timestamp || Date.now();
        const transactionDateForClaim = new Date(timestamp);
        if (isNaN(transactionDateForClaim.getTime())) {
          transactionDateForClaim.setTime(Date.now());
        }
        
        // Try to save WebhookResponse (ignore if it already exists - we'll continue processing)
        // We only care if the actual receive transaction exists (checked above)
        try {
          await prisma.webhookResponse.create({
            data: {
              accountId: addressVirtualAccount.accountId,
              subscriptionType: webhookData.subscriptionType || 'ADDRESS_EVENT',
              amount: parseFloat(webhookData.amount || '0'),
              reference: webhookData.reference || null,
              currency: webhookData.currency || addressVirtualAccount.currency,
              txId: addressTxId || '',
              blockHeight: BigInt(webhookData.blockNumber || 0),
              blockHash: webhookData.blockHash || null,
              fromAddress: counterAddress || null,
              toAddress: webhookAddr || null,
              transactionDate: transactionDateForClaim,
              index: webhookData.logIndex || null,
            },
          });
        } catch (error: any) {
          // If it already exists, that's fine - we'll continue processing
          // The important check is whether the receive transaction exists (done above)
          tatumLogger.info('WebhookResponse might already exist, continuing anyway', {
            txId: addressTxId,
            error: error.message,
          });
          // Continue processing - don't block
        }
      }
    }

    const { accountId, reference, txId, amount, currency, from, to, date, timestamp, blockHeight, blockHash, index } = webhookData;
    
    // Handle date/timestamp - address-based webhooks use timestamp, others use date
    let transactionDate: Date;
    if (date) {
      transactionDate = new Date(date);
    } else if (timestamp) {
      // timestamp is in milliseconds
      transactionDate = new Date(timestamp);
    } else {
      // Default to now if neither is available
      transactionDate = new Date();
    }
    
    // Validate date
    if (isNaN(transactionDate.getTime())) {
      transactionDate = new Date();
    }

    if (!accountId) {
      tatumLogger.warn('Webhook missing accountId', {
        subscriptionType: webhookData.subscriptionType,
        txId: webhookData.txId,
        address: webhookAddress,
      });
      return { processed: false, reason: 'missing_account_id' };
    }

    tatumLogger.webhookProcessing(webhookData);

    // Check for duplicate RECEIVE transaction - only block if the actual transaction exists
    // For address-based webhooks, we already checked above, so skip this check
    if (!isAddressWebhook || webhookData.accountId) {
      const existingReceiveTx = await prisma.cryptoTransaction.findFirst({
        where: {
          transactionType: 'RECEIVE',
          OR: [
            { cryptoReceive: { txHash: txId } },
            ...(reference ? [{ cryptoReceive: { txHash: reference } }] : []),
          ],
        },
      });

      if (existingReceiveTx) {
        tatumLogger.warn(`Receive transaction already exists (txId: ${txId}, reference: ${reference})`, {
          accountId,
          reference,
          txId,
          existingTxId: existingReceiveTx.id,
        });
        return { processed: false, reason: 'duplicate' };
      }
    }

    // Check if from address is master wallet (ignore outbound transfers from master wallet)
    if (from) {
      const normalizedFrom = from.toLowerCase();
      const allMasterWallets = await prisma.masterWallet.findMany({
        where: { address: { not: null } },
      });
      const fromMasterWallet = allMasterWallets.find(
        mw => mw.address?.toLowerCase() === normalizedFrom
      );

      if (fromMasterWallet) {
        tatumLogger.info(`Ignoring webhook from master wallet: ${from}`, {
          accountId,
          reference,
          from,
          normalizedFrom,
          masterWalletId: fromMasterWallet.id,
          blockchain: fromMasterWallet.blockchain,
        });
        return { processed: false, reason: 'master_wallet' };
      }
    }

    // Get virtual account
    const virtualAccount = await virtualAccountService.getVirtualAccountById(accountId);
    if (!virtualAccount) {
      const error = new Error(`Virtual account not found: ${accountId}`);
      tatumLogger.exception('Get virtual account', error, {
        accountId,
        reference,
        txId,
      });
      return { processed: false, reason: 'account_not_found' };
    }

    tatumLogger.virtualAccount('Found virtual account', {
      accountId,
      virtualAccountId: virtualAccount.id,
      userId: virtualAccount.userId,
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
    });

    // Log webhook to WebhookResponse table (only if not already saved for address-based webhooks)
    let webhookResponse;
    if (isAddressWebhook && !webhookData.accountId) {
      // For address-based webhooks, we already saved it above, just fetch it
      webhookResponse = await prisma.webhookResponse.findFirst({
        where: { txId },
      });
      if (!webhookResponse) {
        // Fallback: create it if for some reason it doesn't exist
        webhookResponse = await prisma.webhookResponse.create({
          data: {
            accountId,
            subscriptionType: webhookData.subscriptionType,
            amount: parseFloat(amount),
            reference,
            currency,
            txId,
            blockHeight: BigInt(blockHeight || 0),
            blockHash,
            fromAddress: from,
            toAddress: to,
            transactionDate: transactionDate,
            index,
          },
        });
      }
    } else {
      // For non-address webhooks, create it now
      webhookResponse = await prisma.webhookResponse.create({
        data: {
          accountId,
          subscriptionType: webhookData.subscriptionType,
          amount: parseFloat(amount),
          reference,
          currency,
          txId,
          blockHeight: BigInt(blockHeight || 0),
          blockHash,
          fromAddress: from,
          toAddress: to,
          transactionDate: transactionDate,
          index,
        },
      });
    }

    tatumLogger.info('Webhook response logged', {
      webhookResponseId: webhookResponse.id,
      accountId,
      reference,
      txId,
      amount,
      currency,
    });

    // Update virtual account balance - credit the received amount
    tatumLogger.info('Updating virtual account balance', {
      accountId,
      virtualAccountId: virtualAccount.id,
      currency: virtualAccount.currency,
      amount,
    });

    const currentBalance = new Decimal(virtualAccount.accountBalance || '0');
    const receivedAmount = new Decimal(amount);
    const newBalance = currentBalance.plus(receivedAmount);

    const updatedVirtualAccount = await prisma.virtualAccount.update({
      where: { id: virtualAccount.id },
      data: {
        accountBalance: newBalance.toString(),
        availableBalance: newBalance.toString(),
      },
    });
    
    tatumLogger.balanceUpdate(accountId, updatedVirtualAccount, {
      virtualAccountId: virtualAccount.id,
      currency: virtualAccount.currency,
      balanceBefore: currentBalance.toString(),
      amountReceived: receivedAmount.toString(),
      balanceAfter: newBalance.toString(),
      reference,
      txId,
    });

    // Create received asset record
    const receivedAsset = await prisma.receivedAsset.create({
      data: {
        accountId,
        subscriptionType: webhookData.subscriptionType,
        amount: parseFloat(amount),
        reference,
        currency,
        txId,
        fromAddress: from,
        toAddress: to,
        transactionDate: transactionDate,
        status: 'inWallet',
        index,
        userId: virtualAccount.userId,
      },
    });

    tatumLogger.info('Received asset created', {
      receivedAssetId: receivedAsset.id,
      accountId,
      userId: virtualAccount.userId,
      amount,
      currency,
    });

    // Create receive transaction record
    const receiveTransaction = await prisma.receiveTransaction.create({
      data: {
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        transactionType: 'on_chain',
        senderAddress: from,
        reference,
        txId,
        amount: parseFloat(amount),
        currency,
        blockchain: virtualAccount.blockchain,
        status: 'successful',
      },
    });

    tatumLogger.info('Receive transaction created', {
      receiveTransactionId: receiveTransaction.id,
      userId: virtualAccount.userId,
      virtualAccountId: virtualAccount.id,
      reference,
      txId,
    });

    // Create CryptoReceive transaction record
    try {
      // Get wallet currency for price calculation
      const walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          currency: currency.toUpperCase(),
          blockchain: virtualAccount.blockchain.toLowerCase(),
        },
      });

      // Calculate USD amount
      const amountDecimal = new Decimal(amount);
      const cryptoPrice = walletCurrency?.price ? new Decimal(walletCurrency.price.toString()) : new Decimal('1');
      const amountUsd = amountDecimal.mul(cryptoPrice);

      // Get USD to NGN rate for amountNaira (optional)
      const cryptoRate = await prisma.cryptoRate.findFirst({
        where: {
          transactionType: 'RECEIVE',
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      const usdToNgnRate = cryptoRate?.rate ? new Decimal(cryptoRate.rate.toString()) : new Decimal('1400');
      const amountNaira = amountUsd.mul(usdToNgnRate);

      // Generate transaction ID
      const transactionId = `RECEIVE-${Date.now()}-${virtualAccount.userId}-${Math.random().toString(36).substr(2, 9)}`;

      // Create CryptoReceive transaction
      const cryptoReceiveTx = await cryptoTransactionService.createReceiveTransaction({
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        transactionId,
        fromAddress: from || '',
        toAddress: to || '',
        amount: amountDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNaira: amountNaira.toString(),
        rate: cryptoPrice.toString(),
        txHash: txId || '',
        blockNumber: blockHeight ? BigInt(blockHeight) : undefined,
        confirmations: 0,
        status: 'successful',
      });

      tatumLogger.info('CryptoReceive transaction created', {
        cryptoTransactionId: cryptoReceiveTx.id,
        transactionId: cryptoReceiveTx.transactionId,
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        currency,
        amount: amountDecimal.toString(),
        amountUsd: amountUsd.toString(),
        txHash: txId,
      });
    } catch (error: any) {
      // Log error but don't fail the webhook processing
      tatumLogger.exception('Failed to create CryptoReceive transaction', error, {
        accountId,
        txId,
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
      });
      // Continue processing - the ReceiveTransaction was already created
    }

    const result = {
      processed: true,
      accountId,
      reference,
      txId,
      amount,
      currency,
      userId: virtualAccount.userId,
      virtualAccountId: virtualAccount.id,
    };

    tatumLogger.webhookProcessed(result);

    return result;
  } catch (error: any) {
    tatumLogger.exception('Process blockchain webhook', error, {
      webhookData: {
        accountId: webhookData?.accountId,
        reference: webhookData?.reference,
        txId: webhookData?.txId,
      },
    });
    throw error;
  }
}

