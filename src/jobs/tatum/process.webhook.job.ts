/**
 * Process Blockchain Webhook Job
 * 
 * Processes incoming webhooks from Tatum
 */

import { prisma } from '../../utils/prisma';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import { TatumWebhookPayload } from '../../services/tatum/tatum.service';

/**
 * Process blockchain webhook from Tatum
 */
export async function processBlockchainWebhook(webhookData: TatumWebhookPayload) {
  try {
    const { accountId, reference, txId, amount, currency, from, to, date, blockHeight, blockHash, index } = webhookData;

    console.log(`Processing webhook for account ${accountId}, reference: ${reference}`);

    // Check for duplicate (by reference)
    const existingWebhook = await prisma.webhookResponse.findFirst({
      where: { reference },
    });

    if (existingWebhook) {
      console.log(`Webhook with reference ${reference} already processed`);
      return { processed: false, reason: 'duplicate' };
    }

    // Get virtual account
    const virtualAccount = await virtualAccountService.getVirtualAccountById(accountId);
    if (!virtualAccount) {
      console.error(`Virtual account not found: ${accountId}`);
      return { processed: false, reason: 'account_not_found' };
    }

    // Check if from address is master wallet (ignore top-ups)
    const masterWallet = await prisma.masterWallet.findFirst({
      where: { address: from },
    });

    if (masterWallet) {
      console.log(`Ignoring webhook from master wallet: ${from}`);
      return { processed: false, reason: 'master_wallet' };
    }

    // Log webhook
    await prisma.webhookResponse.create({
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

    // Update virtual account balance from Tatum
    await virtualAccountService.updateBalanceFromTatum(accountId);

    // Create received asset record
    await prisma.receivedAsset.create({
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

    // Create receive transaction record
    await prisma.receiveTransaction.create({
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

    console.log(`Successfully processed webhook for account ${accountId}, reference: ${reference}`);
    return { processed: true, accountId, reference };
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    throw error;
  }
}

