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

    // For address-based webhooks, we can't process them the same way
    // They don't have accountId, so we need to find by address
    if (isAddressWebhook && !webhookData.accountId) {
      tatumLogger.info('Address-based webhook without accountId - ignoring (no virtual account mapping)', {
        address: webhookAddress,
        subscriptionType: webhookData.subscriptionType,
        txId: webhookData.txId,
      });
      return { processed: false, reason: 'address_webhook_no_account' };
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

