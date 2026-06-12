import { Decimal } from '@prisma/client/runtime/library';
import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import tatumLogger from '../../utils/tatum.logger';
import cryptoTransactionService from '../crypto/crypto.transaction.service';
import {
  computeCryptoDepositFee,
  getCryptoDepositFeePercentForWalletCurrency,
} from '../crypto/crypto.deposit.fee.service';
import { sendPushNotification } from '../../utils/pushService';
import {
  DEPOSIT_STATUS_PENDING_VERIFICATION,
  CRYPTO_TX_STATUS_PENDING_VERIFY,
} from '../../constants/deposit.fake';

export interface DepositCreditContext {
  accountId: string;
  virtualAccountId: number;
  userId: number;
  currency: string;
  blockchain: string;
  amount: string;
  txId: string;
  from: string;
  to: string;
  reference: string;
  subscriptionType?: string;
  transactionDate: Date;
  index?: number | null;
  blockHeight?: number | null;
  walletCurrencyId?: number | null;
  contractAddress?: string;
  isToken?: boolean;
}

export interface FinalizeDepositCreditResult {
  receivedAssetId: number;
  receiveTransactionId: number;
  cryptoTransactionId?: number;
}

/** Credit user balance and create successful deposit records (after on-chain verify passes). */
export async function finalizeDepositCredit(
  ctx: DepositCreditContext,
  options?: { skipNotifications?: boolean; upgradeFromPending?: boolean }
): Promise<FinalizeDepositCreditResult> {
  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { id: ctx.virtualAccountId },
  });
  if (!virtualAccount) {
    throw new Error(`Virtual account ${ctx.virtualAccountId} not found`);
  }

  const grossAmount = new Decimal(ctx.amount);
  const walletCurrency = await prisma.walletCurrency.findFirst({
    where: {
      currency: ctx.currency.toUpperCase(),
      blockchain: virtualAccount.blockchain.toLowerCase(),
    },
  });
  const walletCurrencyId = ctx.walletCurrencyId ?? virtualAccount.currencyId ?? walletCurrency?.id ?? null;
  const cryptoPrice = walletCurrency?.price
    ? new Decimal(walletCurrency.price.toString())
    : new Decimal('1');
  const grossUsd = grossAmount.mul(cryptoPrice);

  const cryptoRate = await prisma.cryptoRate.findFirst({
    where: { transactionType: 'RECEIVE', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const usdToNgnRate = cryptoRate?.rate
    ? new Decimal(cryptoRate.rate.toString())
    : new Decimal('1400');

  const feePercent = await getCryptoDepositFeePercentForWalletCurrency(walletCurrencyId);
  const feeBreakdown = computeCryptoDepositFee({
    grossCrypto: grossAmount,
    grossUsd,
    feePercent,
    usdToNgnRate,
  });
  const creditedAmount = feeBreakdown.creditedCrypto;
  const hasFee = feeBreakdown.feeUsd.gt(0);

  const onChainBefore = new Decimal(virtualAccount.onChainBalance || virtualAccount.availableBalance || '0');
  const onChainAfter = onChainBefore.plus(creditedAmount);
  const virtualBal = new Decimal(virtualAccount.virtualBalance || '0');
  const newBalance = virtualBal.plus(onChainAfter);
  const currentBalance = new Decimal(virtualAccount.accountBalance || '0');

  await prisma.virtualAccount.update({
    where: { id: virtualAccount.id },
    data: {
      virtualBalance: virtualBal.toString(),
      onChainBalance: onChainAfter.toString(),
      accountBalance: newBalance.toString(),
      availableBalance: newBalance.toString(),
    },
  });

  tatumLogger.balanceUpdate(ctx.accountId, { accountBalance: newBalance.toString() } as any, {
    virtualAccountId: virtualAccount.id,
    currency: virtualAccount.currency,
    balanceBefore: currentBalance.toString(),
    amountReceived: creditedAmount.toString(),
    grossReceived: grossAmount.toString(),
    balanceAfter: newBalance.toString(),
    reference: ctx.reference,
    txId: ctx.txId,
  });

  let receivedAssetId: number;

  if (options?.upgradeFromPending) {
    const existing = await prisma.receivedAsset.findFirst({
      where: { txId: ctx.txId, status: DEPOSIT_STATUS_PENDING_VERIFICATION },
    });
    if (existing) {
      const updated = await prisma.receivedAsset.update({
        where: { id: existing.id },
        data: {
          amount: parseFloat(ctx.amount),
          status: 'inWallet',
        },
      });
      receivedAssetId = updated.id;
    } else {
      const created = await prisma.receivedAsset.create({
        data: {
          accountId: ctx.accountId,
          subscriptionType: ctx.subscriptionType,
          amount: parseFloat(ctx.amount),
          reference: ctx.reference,
          currency: ctx.currency,
          txId: ctx.txId,
          fromAddress: ctx.from,
          toAddress: ctx.to,
          transactionDate: ctx.transactionDate,
          status: 'inWallet',
          index: ctx.index ?? null,
          userId: ctx.userId,
        },
      });
      receivedAssetId = created.id;
    }

    const pendingRecv = await prisma.receiveTransaction.findFirst({
      where: { txId: ctx.txId, status: CRYPTO_TX_STATUS_PENDING_VERIFY },
    });
    if (pendingRecv) {
      await prisma.receiveTransaction.update({
        where: { id: pendingRecv.id },
        data: { status: 'successful', amount: parseFloat(ctx.amount) },
      });
    } else {
      await prisma.receiveTransaction.create({
        data: {
          userId: ctx.userId,
          virtualAccountId: virtualAccount.id,
          transactionType: 'on_chain',
          senderAddress: ctx.from,
          reference: ctx.reference,
          txId: ctx.txId,
          amount: parseFloat(ctx.amount),
          currency: ctx.currency,
          blockchain: virtualAccount.blockchain,
          status: 'successful',
        },
      });
    }

    const pendingCrypto = await prisma.cryptoTransaction.findFirst({
      where: {
        transactionType: 'RECEIVE',
        cryptoReceive: { is: { txHash: ctx.txId } },
        status: 'pending_verification',
      },
      include: { cryptoReceive: true },
    });
    if (pendingCrypto) {
      await prisma.cryptoTransaction.update({
        where: { id: pendingCrypto.id },
        data: { status: 'successful' },
      });
      if (pendingCrypto.cryptoReceive) {
        await prisma.cryptoReceive.update({
          where: { id: pendingCrypto.cryptoReceive.id },
          data: {
            creditedAmount: creditedAmount,
            grossAmount: grossAmount,
            amount: grossAmount,
          },
        });
      }
    }
  } else {
    const receivedAsset = await prisma.receivedAsset.create({
      data: {
        accountId: ctx.accountId,
        subscriptionType: ctx.subscriptionType,
        amount: parseFloat(ctx.amount),
        reference: ctx.reference,
        currency: ctx.currency,
        txId: ctx.txId,
        fromAddress: ctx.from,
        toAddress: ctx.to,
        transactionDate: ctx.transactionDate,
        status: 'inWallet',
        index: ctx.index ?? null,
        userId: ctx.userId,
      },
    });
    receivedAssetId = receivedAsset.id;

    await prisma.receiveTransaction.create({
      data: {
        userId: ctx.userId,
        virtualAccountId: virtualAccount.id,
        transactionType: 'on_chain',
        senderAddress: ctx.from,
        reference: ctx.reference,
        txId: ctx.txId,
        amount: parseFloat(ctx.amount),
        currency: ctx.currency,
        blockchain: virtualAccount.blockchain,
        status: 'successful',
      },
    });
  }

  const receiveTransaction = await prisma.receiveTransaction.findFirst({
    where: { txId: ctx.txId, userId: ctx.userId },
    orderBy: { id: 'desc' },
  });

  let cryptoTransactionId: number | undefined;

  if (!options?.upgradeFromPending) {
    try {
      const amountNaira = grossUsd.mul(usdToNgnRate);
      const transactionId = `RECEIVE-${Date.now()}-${ctx.userId}-${Math.random().toString(36).substr(2, 9)}`;
      const cryptoReceiveTx = await cryptoTransactionService.createReceiveTransaction({
        userId: ctx.userId,
        virtualAccountId: virtualAccount.id,
        transactionId,
        balanceBucket: 'on_chain',
        fromAddress: ctx.from || '',
        toAddress: ctx.to || '',
        amount: grossAmount.toString(),
        amountUsd: grossUsd.toString(),
        amountNaira: amountNaira.toString(),
        rate: cryptoPrice.toString(),
        grossAmount: grossAmount.toString(),
        creditedAmount: creditedAmount.toString(),
        grossAmountUsd: grossUsd.toString(),
        creditedAmountUsd: feeBreakdown.creditedUsd.toString(),
        serviceFeePercent: hasFee ? feeBreakdown.feePercent.toString() : undefined,
        serviceFeeAmount: hasFee ? feeBreakdown.feeCrypto.toString() : undefined,
        serviceFeeUsd: hasFee ? feeBreakdown.feeUsd.toString() : undefined,
        txHash: ctx.txId || '',
        blockNumber: ctx.blockHeight ? BigInt(ctx.blockHeight) : undefined,
        confirmations: 0,
        status: 'successful',
      });
      cryptoTransactionId = cryptoReceiveTx.id;
    } catch (error: unknown) {
      tatumLogger.exception('Failed to create CryptoReceive transaction', error as Error, {
        accountId: ctx.accountId,
        txId: ctx.txId,
      });
    }
  } else {
    const upgraded = await prisma.cryptoTransaction.findFirst({
      where: { cryptoReceive: { txHash: ctx.txId } },
      orderBy: { id: 'desc' },
    });
    cryptoTransactionId = upgraded?.id;
  }

  if (!options?.skipNotifications) {
    const depositNotifBody = hasFee
      ? `You received ${grossAmount.toString()} ${ctx.currency.toUpperCase()} (~$${grossUsd.toFixed(2)}). Service fee (${feeBreakdown.feePercent.toString()}%): $${feeBreakdown.feeUsd.toFixed(2)}. Credited: ${creditedAmount.toString()} ${ctx.currency.toUpperCase()}.`
      : `You received ${grossAmount.toString()} ${ctx.currency.toUpperCase()}. Your balance has been updated.`;

    try {
      await sendPushNotification({
        userId: ctx.userId,
        title: 'Crypto Deposit Received',
        body: depositNotifBody,
        sound: 'default',
        priority: 'high',
        data: {
          type: 'crypto_receive',
          amount: creditedAmount.toString(),
          grossAmount: grossAmount.toString(),
          currency: ctx.currency.toUpperCase(),
          txHash: ctx.txId || '',
        },
      });

      await prisma.inAppNotification.create({
        data: {
          userId: ctx.userId,
          title: 'Crypto Deposit Received',
          description: depositNotifBody,
          type: InAppNotificationType.customeer,
        },
      });
    } catch (notifError: unknown) {
      tatumLogger.exception('Send deposit credit notification', notifError as Error, {
        userId: ctx.userId,
        txId: ctx.txId,
      });
    }
  }

  return {
    receivedAssetId,
    receiveTransactionId: receiveTransaction?.id ?? 0,
    cryptoTransactionId,
  };
}
