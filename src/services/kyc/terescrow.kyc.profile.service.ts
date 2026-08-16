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
  terescrowKycStatus: 'verified' | 'pending' | 'unverified' | 'incomplete';
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

/**
 * Load the user's approved Terescrow Tier 2 KYC for Busha submission.
 * Prefers Prembly-verified legal names / DOB when present.
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

  if (!user.kycTier2Verified) {
    const pending = await prisma.kycStateTwo.findFirst({
      where: { userId, tier: 'tier2', state: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ready: false,
      needsTerescrowKyc: true,
      terescrowKycStatus: pending ? 'pending' : 'unverified',
      profile: null,
    };
  }

  const approved =
    (await prisma.kycStateTwo.findFirst({
      where: { userId, tier: 'tier2', state: 'approved' },
      orderBy: { createdAt: 'desc' },
    })) ||
    (await prisma.kycStateTwo.findFirst({
      where: { userId, tier: 'tier2' },
      orderBy: { createdAt: 'desc' },
    }));

  if (!approved?.nin || !approved.dob || !approved.selfieUrl) {
    return {
      ready: false,
      needsTerescrowKyc: true,
      terescrowKycStatus: 'incomplete',
      profile: null,
    };
  }

  const firstName = (
    (approved as any).premblyVerifiedFirstName ||
    approved.firtName ||
    user.firstname ||
    ''
  ).trim();
  const lastName = (
    (approved as any).premblyVerifiedLastName ||
    approved.surName ||
    user.lastname ||
    ''
  ).trim();
  const birthDate = ((approved as any).premblyVerifiedDob || approved.dob || '').trim();

  if (firstName.length < 2 || lastName.length < 2) {
    return {
      ready: false,
      needsTerescrowKyc: true,
      terescrowKycStatus: 'incomplete',
      profile: null,
    };
  }

  try {
    readUploadFileAsBase64(approved.selfieUrl);
  } catch {
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
    profile: {
      firstName,
      lastName,
      birthDate,
      nin: approved.nin.replace(/\s+/g, ''),
      bvn: approved.bvn || null,
      selfiePath: approved.selfieUrl,
      idDocumentPath: approved.idDocumentUrl || null,
      documentType: approved.documentType || null,
      documentNumber: approved.documentNumber || null,
      address: approved.address || null,
      phone: (approved as any).premblyPhone || user.phoneNumber || null,
      gender: (approved as any).premblyGender || null,
      country: approved.country || 'Nigeria',
      terescrowKycId: approved.id,
      premblyVerified: !!(approved as any).premblyVerified,
      premblyReference: (approved as any).premblyReference || null,
    },
  };
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
