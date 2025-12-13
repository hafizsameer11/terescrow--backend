/**
 * Process Blockchain Webhook Job
 * 
 * Processes incoming webhooks from Tatum
 */

import { prisma } from '../../utils/prisma';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import { TatumWebhookPayload } from '../../services/tatum/tatum.service';
import tatumLogger from '../../utils/tatum.logger';

/**
 * Process blockchain webhook from Tatum
 */
export async function processBlockchainWebhook(webhookData: TatumWebhookPayload | any) {
  try {
    // Handle address-based webhooks (ADDRESS_EVENT subscription type)
    const isAddressWebhook = webhookData.subscriptionType === 'ADDRESS_EVENT';
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

    // Handle address-based webhooks (ADDRESS_EVENT)
    // These webhooks don't have accountId, but we can find the deposit address by matching the address
    if (isAddressWebhook && !webhookData.accountId) {
      const txId = webhookData.txId || webhookData.txHash;
      const webhookAddr = webhookData.address?.toLowerCase();
      const counterAddress = webhookData.counterAddress?.toLowerCase();
      
      // Check for duplicate by txId
      if (txId) {
        const existingTx = await prisma.cryptoTransaction.findFirst({
          where: {
            OR: [
              { 
                cryptoReceive: { 
                  txHash: txId 
                } 
              },
              { 
                cryptoSend: { 
                  txHash: txId 
                } 
              },
            ],
          },
        });
        
        if (existingTx) {
          tatumLogger.info('Address-based webhook already processed (duplicate txId)', {
            txId,
            address: webhookAddr,
            counterAddress,
          });
          return { processed: false, reason: 'duplicate_tx' };
        }
      }
      
      // If no counterAddress, it's a send transaction - ignore (we handle sends synchronously)
      if (!counterAddress) {
        tatumLogger.info('Address-based webhook without counterAddress - ignoring (send transaction)', {
          address: webhookAddr,
          txId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'send_transaction_ignore' };
      }
      
      // Has counterAddress - this is a RECEIVE transaction
      // Find deposit address by matching the webhook address
      if (!webhookAddr) {
        tatumLogger.warn('Address-based webhook missing address field', {
          txId,
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
          txId,
          counterAddress,
        });
        return { processed: false, reason: 'deposit_address_not_found' };
      }
      
      // Process as receive transaction
      const virtualAccount = depositAddressRecord.virtualAccount;
      const amountStr = webhookData.amount || '0';
      const asset = webhookData.asset; // Contract address for tokens, 'ETH' for native
      const isToken = asset && asset !== 'ETH' && webhookData.type === 'token';
      
      tatumLogger.info('Processing address-based webhook as receive transaction', {
        address: webhookAddr,
        counterAddress,
        amount: amountStr,
        asset,
        isToken,
        txId,
        virtualAccountId: virtualAccount.id,
        userId: virtualAccount.userId,
        currency: virtualAccount.currency,
      });
      
      // Process as receive - continue with normal flow using virtualAccount
      // We'll set accountId to virtualAccount.accountId for compatibility
      webhookData.accountId = virtualAccount.accountId;
      webhookData.currency = virtualAccount.currency;
      // Set from and to addresses for address-based webhooks
      webhookData.from = counterAddress; // Sender
      webhookData.to = webhookAddr; // Receiver (our deposit address)
      // For tokens, we need to match the asset (contract address) with walletCurrency
      if (isToken) {
        const walletCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: virtualAccount.blockchain,
            contractAddress: { not: null },
          },
        });
        // Case-insensitive contract address matching
        const walletCurrency = walletCurrencies.find(
          wc => wc.contractAddress?.toLowerCase() === asset.toLowerCase()
        );
        if (walletCurrency) {
          webhookData.currency = walletCurrency.currency;
        }
      }
    }

    const { accountId, reference, txId, amount, currency, from, to, date, blockHeight, blockHash, index } = webhookData;

    if (!accountId) {
      tatumLogger.warn('Webhook missing accountId', {
        subscriptionType: webhookData.subscriptionType,
        txId: webhookData.txId,
        address: webhookAddress,
      });
      return { processed: false, reason: 'missing_account_id' };
    }

    tatumLogger.webhookProcessing(webhookData);

    // Check for duplicate (by reference or txId)
    const existingWebhook = await prisma.webhookResponse.findFirst({
      where: {
        OR: [
          { reference },
          { txId },
        ],
      },
    });

    if (existingWebhook) {
      tatumLogger.warn(`Webhook already processed (reference: ${reference}, txId: ${txId})`, {
        accountId,
        reference,
        txId,
        existingWebhookId: existingWebhook.id,
      });
      return { processed: false, reason: 'duplicate' };
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

    // Log webhook to WebhookResponse table
    const webhookResponse = await prisma.webhookResponse.create({
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
        transactionDate: new Date(date),
        index,
      },
    });

    tatumLogger.info('Webhook response logged', {
      webhookResponseId: webhookResponse.id,
      accountId,
      reference,
      txId,
      amount,
      currency,
    });

    // Update virtual account balance from Tatum
    tatumLogger.info('Updating virtual account balance from Tatum', {
      accountId,
      virtualAccountId: virtualAccount.id,
    });

    const updatedBalance = await virtualAccountService.updateBalanceFromTatum(accountId);
    
    tatumLogger.balanceUpdate(accountId, updatedBalance, {
      virtualAccountId: virtualAccount.id,
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
        transactionDate: new Date(date),
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

