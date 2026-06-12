/**
 * Process Blockchain Webhook Job
 * 
 * Processes incoming webhooks from Tatum
 */

import { prisma } from '../../utils/prisma';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import { TatumWebhookPayload } from '../../services/tatum/tatum.service';
import tatumLogger from '../../utils/tatum.logger';
import type { WalletCurrency } from '@prisma/client';
import { lockFakeScamDeposit, rejectScamDepositIfNeeded } from '../../services/tatum/deposit.fraud.lock.service';
import { isUserBanned } from '../../utils/customer.restrictions';
import { verifyDepositOnChain } from '../../services/tatum/deposit.onchain.verifier';
import { finalizeDepositCredit, type DepositCreditContext } from '../../services/tatum/deposit.credit.service';
import { createPendingVerificationDeposit } from '../../services/tatum/deposit.pending.service';

/** Sender / counterparty from Tatum payloads (field names and shapes differ by chain). */
function resolveIncomingCounterpartyAddress(webhookData: {
  counterAddress?: unknown;
  counterAddresses?: unknown;
  counter_address?: unknown;
  from?: unknown;
}): string | undefined {
  const ca = webhookData.counterAddress ?? webhookData.counter_address;
  if (typeof ca === 'string' && ca.trim()) return ca.trim();
  const cas = webhookData.counterAddresses;
  if (Array.isArray(cas)) {
    const first = cas.find((x): x is string => typeof x === 'string' && !!x.trim());
    if (first) return first.trim();
  }
  const from = webhookData.from;
  if (typeof from === 'string' && from.trim()) return from.trim();
  return undefined;
}

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
      const addressRaw = typeof webhookData.address === 'string' ? webhookData.address.trim() : '';
      const counterpartyRaw = resolveIncomingCounterpartyAddress(webhookData);
      const isTatumIncomingSubscription =
        webhookData.subscriptionType === 'INCOMING_NATIVE_TX'
        || webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX';

      // Legacy ADDRESS_EVENT may omit counterparty on outbound notifications; INCOMING_* is always inbound to `address`.
      if (!counterpartyRaw && !isTatumIncomingSubscription) {
        tatumLogger.info('Address-based webhook without counterparty - ignoring (treated as non-receive)', {
          address: addressRaw,
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'send_transaction_ignore' };
      }

      if (!addressRaw) {
        tatumLogger.warn('Address-based webhook missing address field', {
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'missing_address' };
      }

      const allDepositAddresses = await prisma.depositAddress.findMany({
        include: {
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
      });

      const depositAddressRecord = allDepositAddresses.find(
        da => da.address.toLowerCase() === addressRaw.toLowerCase()
      );
      
      if (!depositAddressRecord || !depositAddressRecord.virtualAccount) {
        tatumLogger.info('Address-based webhook - deposit address not found', {
          address: addressRaw,
          txId: addressTxId,
          counterparty: counterpartyRaw,
        });
        return { processed: false, reason: 'deposit_address_not_found' };
      }
      
      // Process as receive transaction
      const addressVirtualAccount = depositAddressRecord.virtualAccount;
      const amountStr = webhookData.amount || '0';
      const contractAddress = webhookData.contractAddress || webhookData.asset;
      const chainSlug = addressVirtualAccount.blockchain.toLowerCase();

      const depositUser = await prisma.user.findUnique({
        where: { id: addressVirtualAccount.userId },
        select: { status: true },
      });

      tatumLogger.info('Processing address-based webhook as receive transaction', {
        address: addressRaw,
        counterparty: counterpartyRaw,
        amount: amountStr,
        contractAddress,
        subscriptionType: webhookData.subscriptionType,
        txId: addressTxId,
        virtualAccountId: addressVirtualAccount.id,
        userId: addressVirtualAccount.userId,
        currency: addressVirtualAccount.currency,
      });

      let detectedCurrency = addressVirtualAccount.currency;
      let targetVirtualAccount = addressVirtualAccount;

      // Process as receive - continue with normal flow using the correct virtualAccount
      // We'll set accountId to targetVirtualAccount.accountId for compatibility
      webhookData.accountId = targetVirtualAccount.accountId;
      webhookData.currency = detectedCurrency;
      webhookData.from = counterpartyRaw ?? '';
      webhookData.to = addressRaw;
      
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
            address: addressRaw,
            counterparty: counterpartyRaw,
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
              fromAddress: counterpartyRaw || null,
              toAddress: addressRaw || null,
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

      const addrTimestamp = webhookData.timestamp || Date.now();
      let addrTransactionDate = new Date(addrTimestamp);
      if (isNaN(addrTransactionDate.getTime())) {
        addrTransactionDate = new Date();
      }

      const scamVerdict = await rejectScamDepositIfNeeded({
        userStatus: depositUser?.status,
        chainSlug,
        subscriptionType: webhookData.subscriptionType,
        contractAddress: contractAddress ? String(contractAddress) : null,
        assetField: webhookData.asset ? String(webhookData.asset) : null,
        webhookType: webhookData.type,
        lockPayload: {
          userId: addressVirtualAccount.userId,
          virtualAccountId: addressVirtualAccount.id,
          accountId: addressVirtualAccount.accountId,
          txId: addressTxId || `fake-${Date.now()}`,
          fromAddress: counterpartyRaw ?? '',
          toAddress: addressRaw,
          grossAmount: amountStr,
          contractAddress: contractAddress ? String(contractAddress) : '',
          blockchain: addressVirtualAccount.blockchain,
          subscriptionType: webhookData.subscriptionType,
          transactionDate: addrTransactionDate,
          index: webhookData.logIndex ?? null,
        },
      });

      if (scamVerdict.rejected) {
        if (scamVerdict.reason === 'unlisted_token_contract') {
          tatumLogger.warn('Rejected unlisted token — recorded as fake_scam without credit', {
            txId: addressTxId,
            contractAddress,
            address: addressRaw,
            amount: amountStr,
          });
          return { processed: true, reason: 'fake_scam_token' };
        }
        tatumLogger.warn('Deposit blocked for banned user — no credit', {
          txId: addressTxId,
          userId: addressVirtualAccount.userId,
        });
        return { processed: false, reason: scamVerdict.reason };
      }

      if (scamVerdict.isToken && scamVerdict.walletCurrency) {
        detectedCurrency = scamVerdict.walletCurrency.currency;

        const correctVirtualAccount = await prisma.virtualAccount.findFirst({
          where: {
            userId: addressVirtualAccount.userId,
            currency: scamVerdict.walletCurrency.currency,
            blockchain: addressVirtualAccount.blockchain.toLowerCase(),
          },
          include: {
            walletCurrency: true,
          },
        });

        if (correctVirtualAccount) {
          targetVirtualAccount = correctVirtualAccount;
          webhookData.accountId = correctVirtualAccount.accountId;
          webhookData.currency = detectedCurrency;
          tatumLogger.info('Found correct virtual account for token', {
            originalCurrency: addressVirtualAccount.currency,
            detectedCurrency: scamVerdict.walletCurrency.currency,
            originalVirtualAccountId: addressVirtualAccount.id,
            targetVirtualAccountId: correctVirtualAccount.id,
            contractAddress,
          });
        } else {
          tatumLogger.warn('Virtual account not found for detected currency', {
            userId: addressVirtualAccount.userId,
            currency: scamVerdict.walletCurrency.currency,
            blockchain: addressVirtualAccount.blockchain,
            contractAddress,
          });
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

    const depositUser = await prisma.user.findUnique({
      where: { id: virtualAccount.userId },
      select: { status: true },
    });

    if (isUserBanned(depositUser?.status)) {
      tatumLogger.warn('Skipping deposit credit — user banned', {
        userId: virtualAccount.userId,
        accountId,
        txId,
      });
      return { processed: false, reason: 'user_banned' };
    }

    const webhookContract = webhookData.contractAddress || webhookData.asset;

    const scamVerdict = await rejectScamDepositIfNeeded({
      userStatus: depositUser?.status,
      chainSlug: virtualAccount.blockchain.toLowerCase(),
      subscriptionType: webhookData.subscriptionType,
      contractAddress: webhookContract ? String(webhookContract) : null,
      assetField: webhookData.asset ? String(webhookData.asset) : null,
      webhookType: webhookData.type,
      lockPayload: {
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        accountId,
        txId: txId || `fake-${Date.now()}`,
        fromAddress: from || '',
        toAddress: to || '',
        grossAmount: amount,
        contractAddress: webhookContract ? String(webhookContract) : '',
        blockchain: virtualAccount.blockchain,
        subscriptionType: webhookData.subscriptionType,
        transactionDate,
        index: index ?? null,
      },
    });

    if (scamVerdict.rejected) {
      return {
        processed: scamVerdict.reason === 'unlisted_token_contract',
        reason: scamVerdict.reason === 'unlisted_token_contract' ? 'fake_scam_token' : scamVerdict.reason,
      };
    }

    const creditCtx: DepositCreditContext = {
      accountId,
      virtualAccountId: virtualAccount.id,
      userId: virtualAccount.userId,
      currency,
      blockchain: virtualAccount.blockchain,
      amount,
      txId: txId || '',
      from: from || '',
      to: to || '',
      reference,
      subscriptionType: webhookData.subscriptionType,
      transactionDate,
      index: index ?? null,
      blockHeight: blockHeight ? Number(blockHeight) : null,
      contractAddress: webhookContract ? String(webhookContract) : undefined,
      isToken: scamVerdict.isToken,
    };

    const verifyResult = await verifyDepositOnChain({
      chainSlug: virtualAccount.blockchain.toLowerCase(),
      txHash: txId || '',
      depositAddress: to || '',
      expectedAmount: amount,
      contractAddress: webhookContract ? String(webhookContract) : null,
      isToken: scamVerdict.isToken,
      walletCurrency: scamVerdict.walletCurrency,
      subscriptionType: webhookData.subscriptionType,
      blockNumber: blockHeight ? Number(blockHeight) : null,
    });

    if (verifyResult.status === 'mismatch') {
      await lockFakeScamDeposit({
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        accountId,
        txId: txId || `fake-${Date.now()}`,
        fromAddress: from || '',
        toAddress: to || '',
        grossAmount: amount,
        contractAddress: verifyResult.onChainContract ?? String(webhookContract ?? 'unknown'),
        blockchain: virtualAccount.blockchain,
        subscriptionType: webhookData.subscriptionType,
        transactionDate,
        index: index ?? null,
      });
      return { processed: true, reason: `verify_${verifyResult.reason ?? 'mismatch'}` };
    }

    if (verifyResult.status === 'pending') {
      await createPendingVerificationDeposit(creditCtx, verifyResult);
      return { processed: true, reason: 'pending_verification' };
    }

    const walletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: currency.toUpperCase(),
        blockchain: virtualAccount.blockchain.toLowerCase(),
      },
    });
    creditCtx.walletCurrencyId = virtualAccount.currencyId ?? walletCurrency?.id ?? null;
    const creditResult = await finalizeDepositCredit(creditCtx);

    tatumLogger.info('Deposit credited after on-chain verification', {
      txId,
      receivedAssetId: creditResult.receivedAssetId,
      provider: verifyResult.provider,
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

