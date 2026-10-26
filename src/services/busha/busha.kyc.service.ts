import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { bushaClient } from './busha.client';
import { assertBushaAppActive, submitBushaCustomerKyc, verifyBushaCustomer } from './busha.trade.service';
import {
  getTerescrowKycProfileForBusha,
  markTier2ApprovedAfterBusha,
  markTier2RejectedAfterBusha,
  readUploadFileAsBase64,
  splitAddressForBusha,
} from '../kyc/terescrow.kyc.profile.service';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaKycApplicationModel = (prisma as any).bushaKycApplication;

const SELFIE_DIR = path.join(process.cwd(), 'uploads', 'busha-kyc');

const GENERIC_BUSHA_REJECT_REASONS = new Set([
  'verification was declined',
  'identity verification was declined',
]);

/** Prefer Busha's concrete rejection reason over a generic fallback. */
export function extractBushaRejectionReason(
  payload: any,
  fallback = 'Identity verification was declined'
): string {
  const candidates = [
    payload?.reason,
    payload?.rejection_reason,
    payload?.status_reason,
    payload?.message,
    payload?.error_message,
    payload?.error,
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s.slice(0, 500);
  }
  return fallback;
}

function isGenericBushaRejectReason(reason?: string | null): boolean {
  return GENERIC_BUSHA_REJECT_REASONS.has(String(reason || '').trim().toLowerCase());
}

/** Legacy manual payload — prefer startBushaKycFromTerescrowProfile. */
export type StartBushaKycInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  nin: string;
  selfieBase64: string;
};

type QueueBushaKycParams = {
  firstName: string;
  lastName: string;
  birthDate: string;
  nin: string;
  selfiePath: string;
  idDocumentPath?: string | null;
  source?: string;
  terescrowKycId?: number | null;
};

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('234')) return `+${trimmed}`;
  if (trimmed.startsWith('0')) return `+234${trimmed.slice(1)}`;
  return trimmed;
}

/** Accept ISO / YYYY-MM-DD / DD-MM-YYYY → Busha DD-MM-YYYY */
export function toBushaBirthDate(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) throw ApiError.badRequest('birthDate is required');

  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;

  let day: number;
  let month: number;
  let year: number;

  const dm = raw.match(ddmmyyyy);
  if (dm) {
    day = Number(dm[1]);
    month = Number(dm[2]);
    year = Number(dm[3]);
  } else {
    const ym = raw.match(yyyymmdd);
    if (ym) {
      year = Number(ym[1]);
      month = Number(ym[2]);
      day = Number(ym[3]);
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        throw ApiError.badRequest('birthDate must be DD-MM-YYYY or YYYY-MM-DD');
      }
      day = parsed.getUTCDate();
      month = parsed.getUTCMonth() + 1;
      year = parsed.getUTCFullYear();
    }
  }

  const birth = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const age =
    today.getUTCFullYear() -
    year -
    (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
      ? 1
      : 0);
  if (age < 18) throw ApiError.badRequest('You must be at least 18 years old');
  if (Number.isNaN(birth.getTime())) throw ApiError.badRequest('Invalid birthDate');

  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

function ensureSelfieDir() {
  if (!fs.existsSync(SELFIE_DIR)) {
    fs.mkdirSync(SELFIE_DIR, { recursive: true });
  }
}

function stripBase64DataUrl(value: string): string {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma !== -1) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

function writeSelfieFile(applicationId: string, selfieBase64: string): string {
  ensureSelfieDir();
  const filePath = path.join(SELFIE_DIR, `${applicationId}.b64`);
  fs.writeFileSync(filePath, stripBase64DataUrl(selfieBase64), 'utf8');
  return filePath;
}

/** Read selfie from Terescrow uploads/ path or legacy busha-kyc .b64 staging file. */
function readKycSelfieBase64(selfiePath: string): string {
  if (selfiePath.includes('busha-kyc') && selfiePath.endsWith('.b64')) {
    if (!fs.existsSync(selfiePath)) {
      throw new Error('Selfie file missing for KYC application');
    }
    return fs.readFileSync(selfiePath, 'utf8');
  }
  return readUploadFileAsBase64(selfiePath);
}

function deleteTempSelfieCopy(filePath?: string | null) {
  if (!filePath || !filePath.includes('busha-kyc')) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

export async function getBushaKycStatusForUser(userId: number) {
  await assertBushaAppActive();

  const terescrow = await getTerescrowKycProfileForBusha(userId);
  const customer = await bushaCustomerModel.findUnique({ where: { userId } });
  const application = await bushaKycApplicationModel.findUnique({ where: { userId } });

  const customerStatus = String(customer?.status || '').toLowerCase();
  const appStatus = String(application?.status || 'none').toLowerCase();

  const canTrade = customerStatus === 'active';
  const needsKyc = !canTrade;
  const inProgress = ['pending', 'processing', 'submitted', 'in_review'].includes(appStatus);

  if (canTrade) {
    try {
      await markTier2ApprovedAfterBusha(userId);
    } catch {
      // non-blocking
    }
  }

  let kycStatus: string = 'none';
  if (canTrade) kycStatus = 'active';
  else if (customerStatus === 'in_review' || appStatus === 'in_review' || appStatus === 'submitted') {
    kycStatus = 'in_review';
  } else if (appStatus === 'processing' || appStatus === 'pending') {
    kycStatus = appStatus;
  } else if (appStatus === 'rejected' || customerStatus === 'rejected') {
    kycStatus = 'rejected';
  } else if (appStatus === 'failed') {
    kycStatus = 'failed';
  } else if (!terescrow.ready) {
    kycStatus = terescrow.terescrowKycStatus === 'pending' ? 'terescrow_pending' : 'terescrow_required';
  } else if (customer) {
    kycStatus = customerStatus || 'inactive';
  } else {
    kycStatus = 'ready_to_activate';
  }

  return {
    needsKyc,
    canTrade,
    kycStatus,
    needsTerescrowKyc: terescrow.needsTerescrowKyc,
    terescrowKycReady: terescrow.ready,
    terescrowKycStatus: terescrow.terescrowKycStatus,
    canActivateCrypto: terescrow.ready && !canTrade && !inProgress,
    customerStatus: customer?.status || null,
    applicationStatus: application?.status || null,
    errorMessage: application?.errorMessage || null,
    customer: customer
      ? {
          id: customer.id,
          bushaProfileId: customer.bushaProfileId,
          status: customer.status,
          firstName: customer.firstName,
          lastName: customer.lastName,
        }
      : null,
    terescrowProfile: terescrow.profile
      ? {
          firstName: terescrow.profile.firstName,
          lastName: terescrow.profile.lastName,
          birthDate: terescrow.profile.birthDate,
          ninMasked: `${terescrow.profile.nin.slice(0, 3)}****${terescrow.profile.nin.slice(-2)}`,
        }
      : null,
  };
}

async function queueBushaKycApplication(userId: number, params: QueueBushaKycParams) {
  const existingCustomer = await bushaCustomerModel.findUnique({ where: { userId } });
  if (existingCustomer && String(existingCustomer.status).toLowerCase() === 'active') {
    throw ApiError.badRequest('Crypto wallet is already active for this account');
  }

  const existingApp = await bushaKycApplicationModel.findUnique({ where: { userId } });
  if (existingApp && ['pending', 'processing', 'submitted', 'in_review'].includes(existingApp.status)) {
    throw ApiError.badRequest(
      `Crypto activation is already ${existingApp.status}. Please wait for verification to finish.`
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { firstname: params.firstName, lastname: params.lastName },
  });

  const applicationId = existingApp?.id || uuidv4();
  if (existingApp?.selfiePath) deleteTempSelfieCopy(existingApp.selfiePath);

  // Persist only — do not create/submit a Busha customer (Obiex migration).
  // Existing Busha customers keep trading; this path no longer provisions new ones.
  if (existingApp) {
    await bushaKycApplicationModel.update({
      where: { id: existingApp.id },
      data: {
        firstName: params.firstName,
        lastName: params.lastName,
        birthDate: params.birthDate,
        nin: params.nin,
        selfiePath: params.selfiePath,
        idDocumentPath: params.idDocumentPath || null,
        source: params.source || 'terescrow_kyc',
        terescrowKycId: params.terescrowKycId ?? null,
        status: 'pending',
        errorMessage: 'Saved pending — Busha provisioning disabled (Obiex migration)',
        attempts: 0,
        lastAttemptAt: null,
        submittedAt: null,
      },
    });
  } else {
    await bushaKycApplicationModel.create({
      data: {
        id: applicationId,
        userId,
        firstName: params.firstName,
        lastName: params.lastName,
        birthDate: params.birthDate,
        nin: params.nin,
        selfiePath: params.selfiePath,
        idDocumentPath: params.idDocumentPath || null,
        source: params.source || 'terescrow_kyc',
        terescrowKycId: params.terescrowKycId ?? null,
        status: 'pending',
        errorMessage: 'Saved pending — Busha provisioning disabled (Obiex migration)',
      },
    });
  }

  return getBushaKycStatusForUser(userId);
}

/**
 * Save activation request from Terescrow Tier 2 profile as pending.
 * Does not create a Busha customer (Obiex migration).
 */
export async function startBushaKycFromTerescrowProfile(userId: number) {
  await assertBushaAppActive();

  const terescrow = await getTerescrowKycProfileForBusha(userId);
  if (!terescrow.ready || !terescrow.profile) {
    throw ApiError.badRequest(
      'Complete Terescrow Tier 2 verification first (legal name, date of birth, NIN, and selfie).'
    );
  }

  const p = terescrow.profile;
  if (!/^\d{11}$/.test(p.nin)) {
    throw ApiError.badRequest('Stored NIN is invalid. Please update your Terescrow KYC.');
  }

  return queueBushaKycApplication(userId, {
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate: toBushaBirthDate(p.birthDate),
    nin: p.nin,
    selfiePath: p.selfiePath,
    source: 'terescrow_kyc',
    terescrowKycId: p.terescrowKycId,
  });
}

/** Legacy manual submit — kept for admin/testing. App should use startBushaKycFromTerescrowProfile. */
export async function startBushaKycForUser(userId: number, input: StartBushaKycInput) {
  await assertBushaAppActive();

  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const nin = String(input.nin || '').replace(/\s+/g, '');
  const birthDate = toBushaBirthDate(input.birthDate);
  const selfieBase64 = String(input.selfieBase64 || '').trim();

  if (firstName.length < 2) throw ApiError.badRequest('firstName is required');
  if (lastName.length < 2) throw ApiError.badRequest('lastName is required');
  if (!/^\d{11}$/.test(nin)) throw ApiError.badRequest('NIN must be exactly 11 digits');
  if (!selfieBase64 || selfieBase64.length < 100) {
    throw ApiError.badRequest('A real selfie photo is required');
  }

  const applicationId = uuidv4();
  const selfiePath = writeSelfieFile(applicationId, selfieBase64);

  return queueBushaKycApplication(userId, {
    firstName,
    lastName,
    birthDate,
    nin,
    selfiePath,
    source: 'manual',
    terescrowKycId: null,
  });
}

/**
 * Busha customer create/submit disabled (Obiex migration).
 * Existing Busha customers are untouched; new apps stay pending locally.
 */
export async function processBushaKycApplication(applicationId: string) {
  const app = await bushaKycApplicationModel.findUnique({ where: { id: applicationId } });
  if (!app) return null;
  if (['submitted', 'in_review', 'active'].includes(app.status)) return app;

  // Never create a new Busha customer from KYC. Keep row pending with data saved.
  if (app.status === 'pending' || app.status === 'failed' || app.status === 'processing') {
    await bushaKycApplicationModel.update({
      where: { id: applicationId },
      data: {
        status: 'pending',
        errorMessage:
          app.errorMessage ||
          'Saved pending — Busha provisioning disabled (Obiex migration)',
        lastAttemptAt: new Date(),
      },
    });
  }
  return getBushaKycStatusForUser(app.userId);
}

/** Sync submitted Busha apps — approve Tier 2 when customer becomes active. */
async function syncSubmittedBushaKycStatus(limit = 10) {
  const submitted = await bushaKycApplicationModel.findMany({
    where: { status: { in: ['submitted', 'in_review', 'processing'] } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  for (const app of submitted) {
    try {
      if (!app.bushaCustomerId) continue;
      const customer = await bushaCustomerModel.findUnique({ where: { id: app.bushaCustomerId } });
      if (!customer?.bushaProfileId) continue;

      const remote = await bushaClient.getCustomer(customer.bushaProfileId);
      const status = String(remote.status || '').toLowerCase();

      await bushaCustomerModel.update({
        where: { id: customer.id },
        data: { status: remote.status || customer.status },
      });

      if (status === 'active') {
        await bushaKycApplicationModel.update({
          where: { id: app.id },
          data: { status: 'active', errorMessage: null },
        });
        await markTier2ApprovedAfterBusha(app.userId);
      } else if (status === 'rejected') {
        const rejectReason = extractBushaRejectionReason(remote);
        await bushaKycApplicationModel.update({
          where: { id: app.id },
          data: { status: 'rejected', errorMessage: rejectReason },
        });
        await markTier2RejectedAfterBusha(app.userId, rejectReason);
      }
    } catch (err: any) {
      console.error(`[Busha KYC] status sync failed for ${app.id}:`, err?.message || err);
    }
  }
}

/** Heal cases where webhook marked Busha app rejected/active but KycStateTwo was never synced. */
async function healOrphanedBushaKycOutcomes(limit = 20) {
  const rejectedApps = await bushaKycApplicationModel.findMany({
    where: { status: 'rejected' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  for (const app of rejectedApps) {
    try {
      const customer = await bushaCustomerModel.findFirst({
        where: { userId: app.userId },
        select: { providerData: true },
      });
      const rejectReason = extractBushaRejectionReason(
        customer?.providerData,
        app.errorMessage || 'Identity verification was declined'
      );

      if (app.errorMessage !== rejectReason) {
        await bushaKycApplicationModel.update({
          where: { id: app.id },
          data: { errorMessage: rejectReason },
        });
      }

      const tier2 = await prisma.kycStateTwo.findFirst({
        where: { userId: app.userId, tier: 'tier2' },
        orderBy: { id: 'desc' },
        select: { id: true, state: true, reason: true },
      });
      if (!tier2) continue;

      if (tier2.state === 'pending') {
        await markTier2RejectedAfterBusha(app.userId, rejectReason);
      } else if (
        tier2.state === 'rejected' &&
        isGenericBushaRejectReason(tier2.reason) &&
        !isGenericBushaRejectReason(rejectReason)
      ) {
        // Backfill concrete Busha reason without re-notifying.
        await prisma.kycStateTwo.update({
          where: { id: tier2.id },
          data: { reason: rejectReason },
        });
      }
    } catch (err: any) {
      console.error(`[Busha KYC] reject heal failed for user ${app.userId}:`, err?.message || err);
    }
  }

  const activeApps = await bushaKycApplicationModel.findMany({
    where: { status: 'active' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  for (const app of activeApps) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: app.userId },
        select: { kycTier2Verified: true },
      });
      if (user?.kycTier2Verified) continue;
      await markTier2ApprovedAfterBusha(app.userId);
    } catch (err: any) {
      console.error(`[Busha KYC] approve heal failed for user ${app.userId}:`, err?.message || err);
    }
  }
}

/**
 * No new Busha provisioning and no remote KYC API calls from the poller
 * (avoids paid / quota usage). Local heal only for already-recorded outcomes.
 */
export async function pollPendingBushaKyc(limit = 10) {
  await healOrphanedBushaKycOutcomes(limit);
  return 0;
}
