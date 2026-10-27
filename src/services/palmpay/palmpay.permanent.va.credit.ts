import { v4 as uuidv4 } from 'uuid';
import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { sendPushNotification } from '../../utils/pushService';
import palmpayLogger from '../../utils/palmpay.logger';
import { resolvePermanentVaBankName } from './palmpay.permanent.va.lifecycle';
import { isUserBanned } from '../../utils/customer.restrictions';
import { appNameCompatibleWithBvnName } from '../prembly/prembly.kyc.service';
import {
  VA_DEPOSIT_HELD,
  alertOpsHeldDeposit,
} from './palmpay.va.deposit.review.service';

const permanentVaModel = () => (prisma as any).palmPayPermanentVirtualAccount;

/**
 * Credit wallet when funds hit a permanent personal VA.
 * Idempotent on palmpayOrderNo (or synthetic key from orderId + account).
 * Soft name match: if payer name ≠ app profile name → hold for admin review (no credit).
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

  // Prefer approved; still credit pending so a bad lifecycle sync cannot block pay-ins
  // Never credit frozen/closed/suspended VAs
  let row = await permanentVaModel().findFirst({
    where: { accountNumber, status: 'approved' },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) {
    row = await permanentVaModel().findFirst({
      where: { accountNumber, status: { in: ['pending', 'approved'] } },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!row) return false;

  // Hard stop: banned / frozen accounts must not receive VA credits
  const owner = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { status: true, firstname: true, lastname: true, email: true },
  });
  if (isUserBanned(owner?.status) || String(owner?.status || '').toLowerCase() === 'frozen') {
    palmpayLogger.warn('Permanent VA deposit ignored — user banned/frozen', {
      userId: row.userId,
      accountNumber,
      orderNo: payload?.orderNo,
    });
    return false;
  }

  // Heal: receiving funds proves the VA is live
  if (row.status !== 'approved') {
    row = await permanentVaModel().update({
      where: { id: row.id },
      data: {
        status: 'approved',
        approvedAt: row.approvedAt || new Date(),
        errorMessage: null,
        bankName: resolvePermanentVaBankName(row.bankName),
      },
    });
  }

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
  // Stable key only — never Date.now() (retries would mint new keys → double credit).
  // Always store a non-null palmpayOrderNo so MySQL UNIQUE applies (NULLs are not unique).
  const completeTime = String(
    payload?.completeTime || payload?.completedTime || payload?.transTime || ''
  ).trim();
  const idempotencyKey =
    orderNo ||
    (orderId ? `pva_${accountNumber}_${orderId}` : null) ||
    (completeTime
      ? `pva_${accountNumber}_${amountCents}_${completeTime}`
      : null);

  if (!idempotencyKey) {
    palmpayLogger.warn('Permanent VA deposit rejected — no stable idempotency key', {
      accountNumber,
      amountCents,
      orderNo,
      orderId,
    });
    return false;
  }

  const uniqueOrderKey = idempotencyKey.substring(0, 191);

  const existing = await prisma.fiatTransaction.findUnique({
    where: { palmpayOrderNo: uniqueOrderKey },
  });
  if (existing) {
    palmpayLogger.info('Permanent VA deposit already processed', {
      orderNo: uniqueOrderKey,
      status: existing.status,
    });
    return true;
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

  const payerAccountName = String(payload?.payerAccountName || '').trim();
  const payerBankName = String(payload?.payerBankName || '').trim() || null;
  const appFirst = String(owner?.firstname || '').trim();
  const appLast = String(owner?.lastname || '').trim();
  const appName = `${appFirst} ${appLast}`.trim();

  const nameOk =
    !!payerAccountName &&
    appNameCompatibleWithBvnName(appFirst, appLast, payerAccountName);

  const wallet = await fiatWalletService.getOrCreateWallet(row.userId, currency);
  const txId = uuidv4();

  const baseMeta = {
    source: 'palmpay_permanent_va',
    permanentVaId: row.id,
    accountNumber,
    payerAccountName: payerAccountName || null,
    payerBankName,
    appName,
    webhook: payload,
  };

  if (!nameOk) {
    let transaction;
    try {
      transaction = await prisma.fiatTransaction.create({
        data: {
          id: txId,
          userId: row.userId,
          walletId: wallet.id,
          type: 'DEPOSIT',
          status: VA_DEPOSIT_HELD,
          currency,
          amount: amountNgn,
          fees: 0,
          totalAmount: amountNgn,
          description: `Wallet top-up via permanent account ${accountNumber} (held — name review)`,
          palmpayOrderId: uniqueOrderKey,
          palmpayOrderNo: uniqueOrderKey,
          palmpayStatus: String(payload?.orderStatus ?? payload?.status ?? '2'),
          errorMessage: 'Held for admin review: payer name does not match app profile',
          metadata: JSON.stringify({
            ...baseMeta,
            holdReason: 'payer_name_mismatch',
            reviewStatus: 'pending',
            palmPayOrderNoRaw: orderNo,
          }),
        },
      });
    } catch (err: any) {
      // Unique palmpayOrderNo — concurrent webhook already inserted
      if (err?.code === 'P2002') {
        palmpayLogger.info('Permanent VA held deposit race — already inserted', {
          orderNo: uniqueOrderKey,
        });
        return true;
      }
      throw err;
    }

    const title = 'Deposit under review';
    const body = `NGN ${amountNgn.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} was received but is held for review because the sender name does not match your profile.`;

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
      data: { type: 'deposit_held', transactionId: transaction.id },
    });

    alertOpsHeldDeposit({
      userId: row.userId,
      email: owner?.email,
      amountNgn,
      payerName: payerAccountName || '(missing)',
      appName: appName || '(empty profile)',
      transactionId: transaction.id,
      orderNo,
    });

    palmpayLogger.warn('Permanent VA deposit HELD — payer name mismatch', {
      userId: row.userId,
      amountNgn,
      accountNumber,
      orderNo,
      transactionId: transaction.id,
      payerAccountName,
      appName,
    });
    return true;
  }

  let transaction;
  try {
    transaction = await prisma.fiatTransaction.create({
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
        palmpayOrderId: uniqueOrderKey,
        palmpayOrderNo: uniqueOrderKey,
        palmpayStatus: String(payload?.orderStatus ?? payload?.status ?? '2'),
        metadata: JSON.stringify({
          ...baseMeta,
          nameMatch: true,
          palmPayOrderNoRaw: orderNo,
        }),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      palmpayLogger.info('Permanent VA deposit race — already inserted', {
        orderNo: uniqueOrderKey,
      });
      return true;
    }
    throw err;
  }

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
