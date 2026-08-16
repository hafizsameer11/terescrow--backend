import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { bushaClient } from './busha.client';
import { assertBushaAppActive, submitBushaCustomerKyc, verifyBushaCustomer } from './busha.trade.service';
import {
  getTerescrowKycProfileForBusha,
  readUploadFileAsBase64,
  splitAddressForBusha,
} from '../kyc/terescrow.kyc.profile.service';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaKycApplicationModel = (prisma as any).bushaKycApplication;

const SELFIE_DIR = path.join(process.cwd(), 'uploads', 'busha-kyc');

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

  const application = existingApp
    ? await bushaKycApplicationModel.update({
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
          errorMessage: null,
          attempts: 0,
          lastAttemptAt: null,
          submittedAt: null,
        },
      })
    : await bushaKycApplicationModel.create({
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
        },
      });

  setImmediate(() => {
    processBushaKycApplication(application.id).catch((err) => {
      console.error('[Busha KYC] immediate process error:', err?.message || err);
    });
  });

  try {
    const { queueManager } = await import('../../queue/queue.manager');
    await queueManager.addJob(
      'busha',
      'process-kyc',
      { applicationId: application.id },
      { attempts: 5, timeout: 180_000 }
    );
  } catch (err: any) {
    console.warn('[Busha KYC] queue enqueue skipped:', err?.message || err);
  }

  return getBushaKycStatusForUser(userId);
}

/**
 * Primary path: read approved Terescrow Tier 2 KYC from DB and send to Busha in background.
 */
export async function startBushaKycFromTerescrowProfile(userId: number) {
  await assertBushaAppActive();

  const terescrow = await getTerescrowKycProfileForBusha(userId);
  if (!terescrow.ready || !terescrow.profile) {
    if (terescrow.terescrowKycStatus === 'pending') {
      throw ApiError.badRequest(
        'Your Terescrow identity verification is under review. You can activate crypto once it is approved.'
      );
    }
    throw ApiError.badRequest(
      'Complete Terescrow Tier 2 verification first (legal name, date of birth, NIN, ID document and selfie).'
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
    idDocumentPath: p.idDocumentPath,
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

export async function processBushaKycApplication(applicationId: string) {
  const app = await bushaKycApplicationModel.findUnique({ where: { id: applicationId } });
  if (!app) return null;
  if (['submitted', 'in_review', 'active'].includes(app.status)) return app;

  await bushaKycApplicationModel.update({
    where: { id: applicationId },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      errorMessage: null,
    },
  });

  try {
    const user = await prisma.user.findUnique({ where: { id: app.userId } });
    if (!user) throw new Error('User not found');

    // Reload full Tier 2 / Prembly profile so Busha gets every KYC detail
    const terescrow = await getTerescrowKycProfileForBusha(app.userId);
    const profile = terescrow.profile;

    const email = user.email.trim().toLowerCase();
    const phoneRaw = profile?.phone || user.phoneNumber || '+2348000000000';
    const phone = normalizePhone(phoneRaw);
    const selfieBase64 = readKycSelfieBase64(app.selfiePath || profile?.selfiePath || '');
    let documentImageBase64: string | undefined;
    const idPath = app.idDocumentPath || profile?.idDocumentPath;
    if (idPath) {
      try {
        documentImageBase64 = readUploadFileAsBase64(idPath);
      } catch {
        // ID image optional for NIN+selfie Busha combo
      }
    }

    const bushaAddress = splitAddressForBusha(profile?.address || null);
    const birthDate = app.birthDate || (profile ? toBushaBirthDate(profile.birthDate) : undefined);

    let customer = await bushaCustomerModel.findUnique({ where: { userId: app.userId } });

    if (!customer) {
      const created = await bushaClient.createCustomer({
        email,
        first_name: app.firstName,
        last_name: app.lastName,
        phone,
        country_id: 'NG',
        birth_date: birthDate || app.birthDate,
        address: bushaAddress,
      });

      customer = await bushaCustomerModel.create({
        data: {
          id: uuidv4(),
          bushaProfileId: created.id,
          userId: app.userId,
          email,
          firstName: app.firstName,
          lastName: app.lastName,
          phone,
          countryId: 'NG',
          birthDate: birthDate || app.birthDate,
          nin: app.nin,
          status: created.status || 'inactive',
          createdById: app.userId,
          providerData: {
            ...(created as any),
            terescrowKyc: profile
              ? {
                  terescrowKycId: profile.terescrowKycId,
                  premblyVerified: profile.premblyVerified,
                  premblyReference: profile.premblyReference,
                  bvn: profile.bvn,
                  documentType: profile.documentType,
                  documentNumber: profile.documentNumber,
                  address: profile.address,
                  gender: profile.gender,
                }
              : null,
          } as any,
        },
      });
    } else {
      customer = await bushaCustomerModel.update({
        where: { id: customer.id },
        data: {
          firstName: app.firstName,
          lastName: app.lastName,
          birthDate: birthDate || app.birthDate,
          nin: app.nin,
          phone,
          providerData: {
            ...((customer.providerData as object) || {}),
            terescrowKyc: profile
              ? {
                  terescrowKycId: profile.terescrowKycId,
                  premblyVerified: profile.premblyVerified,
                  premblyReference: profile.premblyReference,
                  bvn: profile.bvn,
                  documentType: profile.documentType,
                  documentNumber: profile.documentNumber,
                  address: profile.address,
                  gender: profile.gender,
                }
              : null,
          } as any,
        },
      });
    }

    // Always send NIN + selfie (+ ID image) — full Prembly-backed identity to Busha
    await submitBushaCustomerKyc(customer.id, {
      documentType: 'national-id',
      documentNumber: app.nin,
      selfieBase64,
      documentImageBase64,
      birthDate: birthDate || app.birthDate,
      firstName: app.firstName,
      lastName: app.lastName,
      phone,
      address: bushaAddress,
    });

    const verified = await verifyBushaCustomer(customer.id);
    const status = String(verified.status || 'in_review').toLowerCase();

    await bushaKycApplicationModel.update({
      where: { id: applicationId },
      data: {
        bushaCustomerId: customer.id,
        status: status === 'active' ? 'active' : status === 'rejected' ? 'rejected' : 'submitted',
        submittedAt: new Date(),
        errorMessage: null,
      },
    });

    deleteTempSelfieCopy(app.selfiePath);

    return getBushaKycStatusForUser(app.userId);
  } catch (error: any) {
    const message = error?.message || 'Busha KYC processing failed';
    await bushaKycApplicationModel.update({
      where: { id: applicationId },
      data: {
        status: 'failed',
        errorMessage: message,
      },
    });
    throw error;
  }
}

/** Poll pending/failed (retryable) KYC applications. */
export async function pollPendingBushaKyc(limit = 10) {
  const pending = await bushaKycApplicationModel.findMany({
    where: {
      status: { in: ['pending', 'failed'] },
      attempts: { lt: 8 },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  for (const app of pending) {
    try {
      await processBushaKycApplication(app.id);
    } catch (err: any) {
      console.error(`[Busha KYC] poll failed for ${app.id}:`, err?.message || err);
    }
  }
  return pending.length;
}
