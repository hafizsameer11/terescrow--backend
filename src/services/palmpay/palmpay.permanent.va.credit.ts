import { v4 as uuidv4 } from 'uuid';
import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { sendPushNotification } from '../../utils/pushService';
import palmpayLogger from '../../utils/palmpay.logger';

const permanentVaModel = () => (prisma as any).palmPayPermanentVirtualAccount;

/**
 * Credit wallet when funds hit a permanent personal VA.
 * Idempotent on palmpayOrderNo (or synthetic key from orderId + account).
 */
export async function creditPermanentVaDeposit(payload: any): Promise<boolean> {
  const accountNumber = String(
    payload?.virtualAccountNo ||
      payload?.accountNo ||
      payload?.accountNumber ||
      payload?.payerVirtualAccNo ||
      payload?.virtualAccNo ||
      ''
  ).trim();

  if (!accountNumber) return false;

  const row = await permanentVaModel().findFirst({
    where: { accountNumber, status: 'approved' },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return false;

  const amountRaw = payload?.amount ?? payload?.orderAmount ?? payload?.transAmount;
  const amountCents = Number(amountRaw);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return false;
  }
  const amountNgn = amountCents / 100;
  const currency = String(payload?.currency || 'NGN').toUpperCase();

  const orderNo = String(payload?.orderNo || payload?.palmpayOrderNo || '').trim() || null;
  const orderId = String(
    payload?.orderId || payload?.outOrderNo || payload?.merchantOrderId || ''
  ).trim();
  const idempotencyKey =
    orderNo ||
    (orderId ? `pva_${accountNumber}_${orderId}` : null) ||
    `pva_${accountNumber}_${amountCents}_${payload?.completeTime || payload?.completedTime || Date.now()}`;

  if (orderNo) {
    const existing = await prisma.fiatTransaction.findUnique({
      where: { palmpayOrderNo: orderNo },
    });
    if (existing) {
      palmpayLogger.info('Permanent VA deposit already credited', { orderNo });
      return true;
    }
  } else {
    const existingMeta = await prisma.fiatTransaction.findFirst({
      where: {
        userId: row.userId,
        type: 'DEPOSIT',
        palmpayOrderId: idempotencyKey,
      },
    });
    if (existingMeta) return true;
  }

  const orderStatus = Number(payload?.orderStatus);
  const statusStr = String(payload?.status || '').toLowerCase();
  // Checkout/deposit success = 2; permanent VA pay-in success = 1 (PalmPay VA order status)
  const isSuccess =
    orderStatus === 1 ||
    orderStatus === 2 ||
    statusStr === 'success' ||
    statusStr === 'successful' ||
    statusStr === 'completed' ||
    statusStr === '1' ||
    statusStr === '2';
  if (!isSuccess) {
    return false;
  }

  const wallet = await fiatWalletService.getOrCreateWallet(row.userId, currency);
  const txId = uuidv4();

  const transaction = await prisma.fiatTransaction.create({
    data: {
      id: txId,
      userId: row.userId,
      walletId: wallet.id,
      type: 'DEPOSIT',
      status: 'pending',
      currency,
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: `Wallet top-up via permanent account ${accountNumber}`,
      palmpayOrderId: idempotencyKey.substring(0, 255),
      palmpayOrderNo: orderNo,
      palmpayStatus: String(payload?.orderStatus ?? payload?.status ?? '2'),
      metadata: JSON.stringify({
        source: 'palmpay_permanent_va',
        permanentVaId: row.id,
        accountNumber,
        webhook: payload,
      }),
    },
  });

  await fiatWalletService.creditWallet(
    wallet.id,
    amountNgn,
    transaction.id,
    `PalmPay permanent VA deposit ${accountNumber}`
  );

  const title = 'Deposit successful';
  const body = `NGN ${amountNgn.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} has been credited to your wallet.`;

  await prisma.inAppNotification.create({
    data: {
      userId: row.userId,
      title,
      description: body,
      type: InAppNotificationType.customeer,
    },
  });
  await sendPushNotification({
    userId: row.userId,
    title,
    body,
    sound: 'default',
    priority: 'high',
    data: { type: 'deposit', transactionId: transaction.id },
  });

  palmpayLogger.info('Permanent VA deposit credited', {
    userId: row.userId,
    amountNgn,
    accountNumber,
    orderNo,
    transactionId: transaction.id,
  });
  return true;
}
