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
export async function processBlockchainWebhook(webhookData: TatumWebhookPayload) {
  try {
    const { accountId, reference, txId, amount, currency, from, to, date, blockHeight, blockHash, index } = webhookData;

    tatumLogger.webhookProcessing(webhookData);

    // Check for duplicate (by reference)
    const existingWebhook = await prisma.webhookResponse.findFirst({
      where: { reference },
    });

    if (existingWebhook) {
      tatumLogger.warn(`Webhook with reference ${reference} already processed`, {
        accountId,
        reference,
        existingWebhookId: existingWebhook.id,
      });
      return { processed: false, reason: 'duplicate' };
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

    // Check if from address is master wallet (ignore top-ups)
    const masterWallet = await prisma.masterWallet.findFirst({
      where: { address: from },
    });

    if (masterWallet) {
      tatumLogger.info(`Ignoring webhook from master wallet: ${from}`, {
        accountId,
        reference,
        from,
        masterWalletId: masterWallet.id,
      });
      return { processed: false, reason: 'master_wallet' };
    }

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

