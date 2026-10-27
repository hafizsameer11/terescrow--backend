import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { sendPushNotification } from '../../utils/pushService';
import { sendSystemEmail } from '../../utils/systemEmail';
import palmpayLogger from '../../utils/palmpay.logger';

export const VA_DEPOSIT_HELD = 'held';
export const VA_DEPOSIT_HELD_REJECTED = 'held_rejected';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';

function parseMeta(raw: unknown): Record<string, unknown> {
  try {
    return raw ? JSON.parse(String(raw)) : {};
  } catch {
    return {};
  }
}

/** List VA deposits held for payer-name mismatch review. */
export async function listHeldVaDeposits(opts?: { page?: number; limit?: number }) {
  const page = Math.max(1, opts?.page || 1);
  const limit = Math.min(100, Math.max(1, opts?.limit || 20));
  const skip = (page - 1) * limit;

  const where = {
    type: 'DEPOSIT' as const,
    status: { in: [VA_DEPOSIT_HELD, VA_DEPOSIT_HELD_REJECTED] },
  };

  const [total, rows] = await Promise.all([
    prisma.fiatTransaction.count({ where }),
    prisma.fiatTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstname: true, lastname: true, status: true, phoneNumber: true },
        },
      },
    }),
  ]);

  return {
    page,
    limit,
    total,
    items: rows.map((r) => {
      const meta = parseMeta(r.metadata);
      return {
        id: r.id,
        userId: r.userId,
        amount: Number(r.amount),
        currency: r.currency,
        status: r.status,
        description: r.description,
        palmpayOrderNo: r.palmpayOrderNo,
        createdAt: r.createdAt,
        user: r.user,
        payerAccountName: meta.payerAccountName || null,
        appName: meta.appName || null,
        payerBankName: meta.payerBankName || null,
        accountNumber: meta.accountNumber || null,
        holdReason: meta.holdReason || null,
        reviewStatus: meta.reviewStatus || (r.status === VA_DEPOSIT_HELD_REJECTED ? 'rejected' : 'pending'),
        reviewedAt: meta.reviewedAt || null,
        reviewedBy: meta.reviewedBy || null,
        reviewNote: meta.reviewNote || null,
      };
    }),
  };
}

/** Admin approve → credit wallet and complete. */
export async function approveHeldVaDeposit(opts: {
  transactionId: string;
  adminUserId: number;
  note?: string;
}) {
  const tx = await prisma.fiatTransaction.findUnique({ where: { id: opts.transactionId } });
  if (!tx || tx.type !== 'DEPOSIT') throw ApiError.notFound('Deposit not found');
  if (tx.status === 'completed') {
    throw ApiError.badRequest('Deposit already approved/credited');
  }
  if (tx.status !== VA_DEPOSIT_HELD) {
    throw ApiError.badRequest(`Deposit is not held for review (status=${tx.status})`);
  }

  const amount = Number(tx.amount);
  if (!(amount > 0)) throw ApiError.badRequest('Invalid deposit amount');

  const meta = parseMeta(tx.metadata);
  meta.reviewStatus = 'approved';
  meta.reviewedAt = new Date().toISOString();
  meta.reviewedBy = opts.adminUserId;
  if (opts.note) meta.reviewNote = String(opts.note).slice(0, 500);

  // Atomic claim: only one approver wins (status must still be held)
  const claimed = await prisma.$executeRaw`
    UPDATE FiatTransaction
    SET
      status = 'pending',
      metadata = ${JSON.stringify(meta)},
      description = ${`${tx.description || 'Wallet top-up'} (admin approved name review)`},
      updatedAt = NOW(3)
    WHERE id = ${tx.id} AND status = ${VA_DEPOSIT_HELD}
  `;
  if (!claimed) {
    throw ApiError.badRequest('Deposit already claimed or no longer held');
  }

  // creditWallet locks txn + wallet; second concurrent call is idempotent if completed
  await fiatWalletService.creditWallet(
    tx.walletId,
    amount,
    tx.id,
    `Admin approved VA deposit ${tx.palmpayOrderNo || tx.id.slice(0, 8)}`
  );

  const title = 'Deposit approved';
  const body = `NGN ${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} has been credited to your wallet after review.`;

  await prisma.inAppNotification.create({
    data: {
      userId: tx.userId,
      title,
      description: body,
      type: InAppNotificationType.customeer,
    },
  });
  await sendPushNotification({
    userId: tx.userId,
    title,
    body,
    sound: 'default',
    priority: 'high',
    data: { type: 'deposit_approved', transactionId: tx.id },
  });

  palmpayLogger.info('Held VA deposit approved', {
    transactionId: tx.id,
    userId: tx.userId,
    amount,
    adminUserId: opts.adminUserId,
  });

  try {
    const { logAdminAction } = await import('../admin/admin.audit.service');
    await logAdminAction({
      adminUserId: opts.adminUserId,
      action: 'va_deposit.approve',
      path: `/api/admin/va-deposit-review/${tx.id}/approve`,
      targetUserId: tx.userId,
      meta: { transactionId: tx.id, amount, note: opts.note || null },
    });
  } catch {
    /* ignore audit failures */
  }

  return prisma.fiatTransaction.findUnique({ where: { id: tx.id } });
}

/** Admin reject → keep held forever (never credit). */
export async function rejectHeldVaDeposit(opts: {
  transactionId: string;
  adminUserId: number;
  note?: string;
}) {
  const tx = await prisma.fiatTransaction.findUnique({ where: { id: opts.transactionId } });
  if (!tx || tx.type !== 'DEPOSIT') throw ApiError.notFound('Deposit not found');
  if (tx.status !== VA_DEPOSIT_HELD) {
    throw ApiError.badRequest(`Deposit is not held for review (status=${tx.status})`);
  }

  const meta = parseMeta(tx.metadata);
  meta.reviewStatus = 'rejected';
  meta.reviewedAt = new Date().toISOString();
  meta.reviewedBy = opts.adminUserId;
  if (opts.note) meta.reviewNote = String(opts.note).slice(0, 500);

  const claimed = await prisma.$executeRaw`
    UPDATE FiatTransaction
    SET
      status = ${VA_DEPOSIT_HELD_REJECTED},
      metadata = ${JSON.stringify(meta)},
      errorMessage = ${'Deposit held permanently — payer name mismatch (admin rejected)'},
      description = ${`${tx.description || 'Wallet top-up'} (held — admin rejected)`},
      updatedAt = NOW(3)
    WHERE id = ${tx.id} AND status = ${VA_DEPOSIT_HELD}
  `;
  if (!claimed) {
    throw ApiError.badRequest('Deposit already claimed or no longer held');
  }

  const updated = await prisma.fiatTransaction.findUnique({ where: { id: tx.id } });
  if (!updated) throw ApiError.notFound('Deposit not found');

  const amount = Number(tx.amount);
  const title = 'Deposit not released';
  const body = `A deposit of NGN ${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} could not be released after review. Contact support if you need help.`;

  await prisma.inAppNotification.create({
    data: {
      userId: tx.userId,
      title,
      description: body,
      type: InAppNotificationType.customeer,
    },
  });
  await sendPushNotification({
    userId: tx.userId,
    title,
    body,
    sound: 'default',
    priority: 'high',
    data: { type: 'deposit_held_rejected', transactionId: tx.id },
  });

  palmpayLogger.info('Held VA deposit rejected (forever)', {
    transactionId: tx.id,
    userId: tx.userId,
    amount,
    adminUserId: opts.adminUserId,
  });

  try {
    const { logAdminAction } = await import('../admin/admin.audit.service');
    await logAdminAction({
      adminUserId: opts.adminUserId,
      action: 'va_deposit.reject',
      path: `/api/admin/va-deposit-review/${tx.id}/reject`,
      targetUserId: tx.userId,
      meta: { transactionId: tx.id, amount, note: opts.note || null },
    });
  } catch {
    /* ignore audit failures */
  }

  return updated;
}

export async function alertOpsHeldDeposit(opts: {
  userId: number;
  email?: string | null;
  amountNgn: number;
  payerName: string;
  appName: string;
  transactionId: string;
  orderNo?: string | null;
}) {
  sendSystemEmail(
    OPS_ALERT_EMAIL,
    `[Tercescrow] VA deposit held — name mismatch`,
    `<p><b>Deposit held for admin review</b> (payer name ≠ app name).</p>
     <p>User: ${opts.email || opts.userId} (id ${opts.userId})</p>
     <p>Amount: ₦${opts.amountNgn.toLocaleString()}</p>
     <p>App name: <code>${opts.appName}</code></p>
     <p>Payer name: <code>${opts.payerName}</code></p>
     <p>Tx: <code>${opts.transactionId}</code></p>
     <p>Order: <code>${opts.orderNo || 'n/a'}</code></p>
     <p>Approve/reject via admin VA deposit review API.</p>
     <p>Time: ${new Date().toISOString()}</p>`
  ).catch(() => undefined);
}
