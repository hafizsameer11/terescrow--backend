import fs from 'fs';
import path from 'path';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';

export type TerescrowKycProfile = {
  firstName: string;
  lastName: string;
  birthDate: string;
  nin: string;
  bvn: string | null;
  selfiePath: string;
  idDocumentPath: string | null;
  documentType: string | null;
  documentNumber: string | null;
  address: string | null;
  phone: string | null;
  gender: string | null;
  country: string | null;
  terescrowKycId: number;
  premblyVerified: boolean;
  premblyReference: string | null;
};

export type TerescrowKycReadiness = {
  ready: boolean;
  needsTerescrowKyc: boolean;
  /** pending = Prembly passed / awaiting Busha; verified = Tier 2 approved after Busha */
  terescrowKycStatus: 'verified' | 'pending' | 'unverified' | 'incomplete' | 'rejected';
  profile: TerescrowKycProfile | null;
};

function resolveUploadPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(process.cwd(), normalized);
}

/** Read an uploaded KYC image from disk as raw base64 for Busha API. */
export function readUploadFileAsBase64(relativePath: string): string {
  const abs = resolveUploadPath(relativePath);
  if (!fs.existsSync(abs)) {
    throw ApiError.badRequest(`KYC file not found on server: ${relativePath}`);
  }
  return fs.readFileSync(abs).toString('base64');
}

function buildProfileFromRow(
  row: any,
  user: { firstname: string | null; lastname: string | null; phoneNumber: string | null }
): TerescrowKycProfile | null {
  if (!row?.nin || !row.dob || !row.selfieUrl) return null;

  const firstName = (
    row.firtName ||
    row.premblyVerifiedFirstName ||
    user.firstname ||
    ''
  ).trim();
  const lastName = (
    row.surName ||
    row.premblyVerifiedLastName ||
    user.lastname ||
    ''
  ).trim();
  const birthDate = (row.dob || row.premblyVerifiedDob || '').trim();

  if (firstName.length < 2 || lastName.length < 2) return null;

  try {
    readUploadFileAsBase64(row.selfieUrl);
  } catch {
    return null;
  }

  return {
    firstName,
    lastName,
    birthDate,
    nin: String(row.nin).replace(/\s+/g, ''),
    bvn: row.bvn || null,
    selfiePath: row.selfieUrl,
    idDocumentPath: row.idDocumentUrl || null,
    documentType: row.documentType || null,
    documentNumber: row.documentNumber || null,
    address: row.address || null,
    phone: row.premblyPhone || user.phoneNumber || null,
    gender: row.premblyGender || null,
    country: row.country || 'Nigeria',
    terescrowKycId: row.id,
    premblyVerified: !!row.premblyVerified,
    premblyReference: row.premblyReference || null,
  };
}

/**
 * Load Terescrow Tier 2 KYC for Busha submission.
 * Ready when a pending Tier 2 row has NIN + selfie + names (submitted by app),
 * or when Tier 2 is already approved.
 */
export async function getTerescrowKycProfileForBusha(userId: number): Promise<TerescrowKycReadiness> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kycTier2Verified: true,
      firstname: true,
      lastname: true,
      phoneNumber: true,
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.kycTier2Verified) {
    const approved =
      (await prisma.kycStateTwo.findFirst({
        where: { userId, tier: 'tier2', state: 'approved' },
        orderBy: { createdAt: 'desc' },
      })) ||
      (await prisma.kycStateTwo.findFirst({
        where: { userId, tier: 'tier2' },
        orderBy: { createdAt: 'desc' },
      }));

    const profile = buildProfileFromRow(approved, user);
    if (!profile) {
      return {
        ready: false,
        needsTerescrowKyc: true,
        terescrowKycStatus: 'incomplete',
        profile: null,
      };
    }
    return {
      ready: true,
      needsTerescrowKyc: false,
      terescrowKycStatus: 'verified',
      profile,
    };
  }

  const pending = await prisma.kycStateTwo.findFirst({
    where: {
      userId,
      tier: 'tier2',
      state: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (pending) {
    const profile = buildProfileFromRow(pending, user);
    if (profile) {
      return {
        ready: true,
        needsTerescrowKyc: false,
        terescrowKycStatus: 'pending',
        profile,
      };
    }
    return {
      ready: false,
      needsTerescrowKyc: true,
      terescrowKycStatus: 'incomplete',
      profile: null,
    };
  }

  const rejected = await prisma.kycStateTwo.findFirst({
    where: { userId, tier: 'tier2', state: 'rejected' },
    orderBy: { createdAt: 'desc' },
  });
  if (rejected) {
    return {
      ready: false,
      needsTerescrowKyc: true,
      terescrowKycStatus: 'rejected',
      profile: null,
    };
  }

  return {
    ready: false,
    needsTerescrowKyc: true,
    terescrowKycStatus: 'unverified',
    profile: null,
  };
}

/** After Busha customer is active — mark Terescrow Tier 2 approved. */
export async function markTier2ApprovedAfterBusha(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycTier2Verified: true },
  });
  if (!user || user.kycTier2Verified) return;

  const submission = await prisma.kycStateTwo.findFirst({
    where: {
      userId,
      tier: 'tier2',
      OR: [{ state: 'pending' }, { state: 'approved' }],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!submission) return;

  const firstName = (submission.firtName || (submission as any).premblyVerifiedFirstName || '').trim();
  const lastName = (submission.surName || (submission as any).premblyVerifiedLastName || '').trim();

  await prisma.kycStateTwo.update({
    where: { id: submission.id },
    data: {
      state: 'approved',
      reason: 'Verified — crypto KYC approved',
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstName ? { firstname: firstName } : {}),
      ...(lastName ? { lastname: lastName } : {}),
      kycTier2Verified: true,
      currentKycTier: 'tier2',
    },
  });

  const { notifyUserKycApproved } = await import('./kyc.notification.service');
  notifyUserKycApproved(userId, 'tier2').catch(console.error);
}

/**
 * After Busha customer verification is rejected — flip pending Tier 2 and notify.
 * Idempotent: no-op if there is no pending Tier 2 row.
 */
export async function markTier2RejectedAfterBusha(
  userId: number,
  reason = 'Identity verification was declined'
): Promise<boolean> {
  const updated = await prisma.kycStateTwo.updateMany({
    where: { userId, tier: 'tier2', state: 'pending' },
    data: {
      state: 'rejected',
      reason,
    },
  });

  if (updated.count === 0) return false;

  const { notifyUserKycRejected } = await import('./kyc.notification.service');
  await notifyUserKycRejected(userId, 'tier2', reason);
  return true;
}

/** Split a free-text address into Busha address fields (best-effort). */
export function splitAddressForBusha(address: string | null | undefined): {
  city: string;
  state: string;
  address_line_1: string;
  postal_code: string;
  country_id: string;
} {
  const raw = (address || '').trim();
  if (!raw) {
    return {
      city: 'Lagos',
      state: 'Lagos',
      address_line_1: 'Nigeria',
      postal_code: '100001',
      country_id: 'NG',
    };
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const address_line_1 = parts[0] || raw;
  const city = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || 'Lagos';
  const state = parts.length >= 1 ? parts[parts.length - 1] : 'Lagos';
  return {
    city: city.slice(0, 80) || 'Lagos',
    state: state.slice(0, 80) || 'Lagos',
    address_line_1: address_line_1.slice(0, 120),
    postal_code: '100001',
    country_id: 'NG',
  };
}
