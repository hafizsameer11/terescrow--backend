import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { palmpayConfig } from './palmpay.config';
import { palmpayPermanentVaClient } from './palmpay.permanent.va.service';
import { sendPushNotification } from '../../utils/pushService';
import palmpayLogger from '../../utils/palmpay.logger';

const permanentVaModel = () => (prisma as any).palmPayPermanentVirtualAccount;

function mapRemoteStatus(raw?: string | null): 'pending' | 'approved' | 'rejected' | 'failed' | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).toLowerCase().trim();
  if (['approved', 'active', 'success', 'successful', 'enabled', '2'].includes(s)) return 'approved';
  if (['pending', 'processing', 'in_review', 'submitted', '0', '1'].includes(s)) return 'pending';
  if (['rejected', 'declined', '3'].includes(s)) return 'rejected';
  if (['failed', 'disabled', '4'].includes(s)) return 'failed';
  if (s.includes('approv') || s.includes('active') || s.includes('success')) return 'approved';
  if (s.includes('reject') || s.includes('declin')) return 'rejected';
  if (s.includes('fail') || s.includes('disable')) return 'failed';
  if (s.includes('pend') || s.includes('process') || s.includes('review')) return 'pending';
  return null;
}

async function notifyVaStatus(
  userId: number,
  kind: 'approved' | 'rejected' | 'submitted',
  reason?: string
) {
  const title =
    kind === 'approved'
      ? 'Funding account ready'
      : kind === 'rejected'
        ? 'Funding account declined'
        : 'Funding account submitted';
  const description =
    kind === 'approved'
      ? 'Your permanent bank account is ready. Open Fund Wallet to copy your account details.'
      : kind === 'rejected'
        ? (reason || 'Verification was declined. Please try again with a valid BVN.').slice(0, 500)
        : 'We received your request. You will be notified when your funding account is approved.';

  await prisma.inAppNotification.create({
    data: {
      userId,
      title,
      description,
      type: InAppNotificationType.customeer,
    },
  });
  await sendPushNotification({
    userId,
    title,
    body: description,
    sound: 'default',
    priority: 'high',
    data: { type: 'palmpay_permanent_va', status: kind },
  });
}

export function serializePermanentVa(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    accountType: row.accountType || 'personal',
    accountNumber: row.accountNumber,
    accountName: row.accountName,
    bankName: row.bankName,
    bankCode: row.bankCode,
    virtualAccountId: row.virtualAccountId,
    errorMessage: row.errorMessage,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Prefill helper for mobile — never expose full BVN after approve; last4 only
    bvnLast4: row.bvn ? String(row.bvn).slice(-4) : null,
  };
}

export async function getLatestPermanentVaForUser(userId: number) {
  return permanentVaModel().findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Prefer approved; else latest pending; else latest overall. */
export async function getFundVirtualAccountForUser(userId: number) {
  const approved = await permanentVaModel().findFirst({
    where: { userId, status: 'approved' },
    orderBy: { createdAt: 'desc' },
  });
  if (approved) return approved;

  const pending = await permanentVaModel().findFirst({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (pending) return pending;

  return getLatestPermanentVaForUser(userId);
}

export async function getStoredBvnHint(userId: number): Promise<string | null> {
  const tier3 = await prisma.kycStateTwo.findFirst({
    where: { userId, tier: 'tier3', bvn: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { bvn: true },
  });
  if (tier3?.bvn && /^\d{11}$/.test(String(tier3.bvn).replace(/\s+/g, ''))) {
    return String(tier3.bvn).replace(/\s+/g, '');
  }
  const latest = await getLatestPermanentVaForUser(userId);
  if (latest?.bvn && /^\d{11}$/.test(latest.bvn)) return latest.bvn;
  return null;
}

export async function applyPermanentVaRemoteStatus(
  row: any,
  remote: {
    status?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    bankName?: string | null;
    bankCode?: string | null;
    virtualAccountId?: string | null;
    message?: string | null;
    raw?: Record<string, unknown>;
  }
): Promise<any> {
  const mapped = mapRemoteStatus(remote.status);
  const prev = row.status;
  const data: any = {
    lastQueriedAt: new Date(),
    ...(remote.accountNumber ? { accountNumber: remote.accountNumber } : {}),
    ...(remote.accountName ? { accountName: remote.accountName } : {}),
    ...(remote.bankName ? { bankName: remote.bankName } : {}),
    ...(remote.bankCode ? { bankCode: remote.bankCode } : {}),
    ...(remote.virtualAccountId ? { virtualAccountId: remote.virtualAccountId } : {}),
    ...(remote.raw ? { providerPayload: JSON.stringify(remote.raw) } : {}),
  };

  if (mapped === 'approved') {
    data.status = 'approved';
    data.approvedAt = row.approvedAt || new Date();
    data.errorMessage = null;
    data.rejectedAt = null;
  } else if (mapped === 'rejected') {
    data.status = 'rejected';
    data.rejectedAt = new Date();
    data.errorMessage = remote.message || 'Verification was declined';
  } else if (mapped === 'failed') {
    data.status = 'failed';
    data.errorMessage = remote.message || 'Virtual account creation failed';
  } else if (mapped === 'pending') {
    data.status = 'pending';
  }

  const updated = await permanentVaModel().update({
    where: { id: row.id },
    data,
  });

  if (prev !== 'approved' && updated.status === 'approved') {
    await notifyVaStatus(row.userId, 'approved');
  } else if (prev !== 'rejected' && updated.status === 'rejected') {
    await notifyVaStatus(row.userId, 'rejected', updated.errorMessage || undefined);
  }

  return updated;
}

export async function createPersonalPermanentVa(opts: {
  userId: number;
  bvn: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const bvn = String(opts.bvn || '').replace(/\s+/g, '');
  if (!/^\d{11}$/.test(bvn)) {
    throw ApiError.badRequest('BVN must be exactly 11 digits');
  }

  const existingApproved = await permanentVaModel().findFirst({
    where: { userId: opts.userId, status: 'approved' },
  });
  if (existingApproved) {
    throw ApiError.badRequest('You already have an approved funding account');
  }

  const existingPending = await permanentVaModel().findFirst({
    where: { userId: opts.userId, status: 'pending' },
  });
  if (existingPending) {
    throw ApiError.badRequest('Your funding account request is already being processed');
  }

  const first = String(opts.firstName || '').trim();
  const last = String(opts.lastName || '').trim();
  const fullName = `${first} ${last}`.trim() || `User ${opts.userId}`;
  const accountReference = palmpayPermanentVaClient.generateAccountReference(opts.userId);
  const notifyUrl = palmpayConfig.getWebhookUrl();

  const row = await permanentVaModel().create({
    data: {
      userId: opts.userId,
      accountType: 'personal',
      bvn,
      status: 'pending',
      merchantRequestId: accountReference,
      notifyUrl,
      accountName: fullName,
    },
  });

  try {
    const remote = await palmpayPermanentVaClient.create({
      accountReference,
      virtualAccountName: fullName,
      customerName: fullName,
      licenseNumber: bvn,
      email: opts.email,
      phone: opts.phone,
      notifyUrl,
    });

    const updated = await applyPermanentVaRemoteStatus(row, remote);

    // If create returned account number + approved-like, good; else stay pending
    if (
      remote.accountNumber &&
      remote.accountNumber.length >= 10 &&
      mapRemoteStatus(remote.status) === 'approved'
    ) {
      // already handled in apply
    } else if (remote.accountNumber && remote.accountNumber.length >= 10) {
      // Store numbers while pending review
      await permanentVaModel().update({
        where: { id: row.id },
        data: {
          accountNumber: remote.accountNumber,
          accountName: remote.accountName || fullName,
          bankName: remote.bankName,
          bankCode: remote.bankCode,
          virtualAccountId: remote.virtualAccountId,
          providerPayload: JSON.stringify(remote.raw),
        },
      });
    }

    await notifyVaStatus(opts.userId, 'submitted');
    return permanentVaModel().findUnique({ where: { id: row.id } });
  } catch (err: any) {
    palmpayLogger.error('Permanent VA create failed', err, { userId: opts.userId });
    await permanentVaModel().update({
      where: { id: row.id },
      data: {
        status: 'failed',
        errorMessage: err?.message || 'Failed to create virtual account',
        providerPayload: err?.raw ? JSON.stringify(err.raw) : undefined,
      },
    });
    throw ApiError.badRequest(err?.message || 'Failed to create funding account. Please try again.');
  }
}

export async function refreshPermanentVaFromPalmPay(userId: number) {
  const row = await getFundVirtualAccountForUser(userId);
  if (!row) throw ApiError.notFound('No funding account found');

  const remote = await palmpayPermanentVaClient.query({
    accountReference: row.merchantRequestId,
    virtualAccountNo: row.accountNumber || undefined,
    virtualAccountId: row.virtualAccountId || undefined,
  });

  return applyPermanentVaRemoteStatus(row, remote);
}

/** Mark approved/rejected from webhook lifecycle payload. */
export async function syncPermanentVaFromWebhook(payload: any): Promise<boolean> {
  const accountNumber = String(
    payload?.virtualAccountNo ||
      payload?.accountNo ||
      payload?.accountNumber ||
      payload?.payerVirtualAccNo ||
      ''
  ).trim();
  const accountReference = String(
    payload?.accountReference || payload?.merchantRequestId || payload?.orderId || ''
  ).trim();
  const virtualAccountId = String(
    payload?.virtualAccountId || payload?.accountId || payload?.payerAccountId || ''
  ).trim();

  let row =
    (accountNumber &&
      (await permanentVaModel().findFirst({
        where: { accountNumber },
        orderBy: { createdAt: 'desc' },
      }))) ||
    (accountReference &&
      (await permanentVaModel().findFirst({
        where: { merchantRequestId: accountReference },
      }))) ||
    (virtualAccountId &&
      (await permanentVaModel().findFirst({
        where: { virtualAccountId },
        orderBy: { createdAt: 'desc' },
      })));

  if (!row) return false;

  const statusHint =
    payload?.accountStatus ||
    payload?.vaStatus ||
    payload?.status ||
    payload?.orderStatus ||
    (payload?.event && String(payload.event).includes('reject') ? 'rejected' : null) ||
    (payload?.event && String(payload.event).includes('approv') ? 'approved' : null);

  await applyPermanentVaRemoteStatus(row, {
    status: statusHint != null ? String(statusHint) : null,
    accountNumber: accountNumber || row.accountNumber,
    accountName: payload?.accountName || payload?.payerAccountName || payload?.virtualAccountName,
    bankName: payload?.bankName || payload?.payerBankName,
    bankCode: payload?.bankCode,
    virtualAccountId: virtualAccountId || row.virtualAccountId,
    message: payload?.respMsg || payload?.message || payload?.errorMessage,
    raw: payload,
  });
  return true;
}

export async function pollPendingPermanentVirtualAccounts(limit = 10) {
  const pending = await permanentVaModel().findMany({
    where: { status: 'pending' },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  let synced = 0;
  for (const row of pending) {
    try {
      const remote = await palmpayPermanentVaClient.query({
        accountReference: row.merchantRequestId,
        virtualAccountNo: row.accountNumber || undefined,
        virtualAccountId: row.virtualAccountId || undefined,
      });
      await applyPermanentVaRemoteStatus(row, remote);
      synced += 1;
    } catch (err: any) {
      palmpayLogger.error('Permanent VA poll failed', err, { id: row.id, userId: row.userId });
    }
  }
  return synced;
}
