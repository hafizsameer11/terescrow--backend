import fs from 'fs';
import path from 'path';
import { premblyClient, PremblyEnvelope, PremblyFaceData } from './prembly.client';
import { premblyConfig } from './prembly.config';
import ApiError from '../../utils/ApiError';

export type PremblyDocumentType = 'drivers_license' | 'international_passport';

export type PremblyTier2Input = {
  firstName: string;
  lastName: string;
  dob: string;
  nin: string;
  phone?: string | null;
  selfieRelativePath: string;
};

export type PremblyTier3Input = {
  firstName: string;
  lastName: string;
  dob: string;
  bvn: string;
  documentType: PremblyDocumentType;
  documentNumber: string;
  selfieRelativePath: string;
};

export type PremblyVerifiedIdentity = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  birthDate: string;
  phone?: string | null;
  gender?: string | null;
  residentialAddress?: string | null;
  nin?: string;
  bvn?: string;
};

export type PremblyTier2Result = {
  passed: boolean;
  ninFacePassed: boolean;
  ninConfidence: number | null;
  reference: string | null;
  verified: PremblyVerifiedIdentity | null;
  failureReasons: string[];
  raw: {
    ninFace?: PremblyEnvelope;
  };
};

export type PremblyTier3Result = {
  passed: boolean;
  bvnFacePassed: boolean;
  docFacePassed: boolean;
  bvnConfidence: number | null;
  docConfidence: number | null;
  reference: string | null;
  verified: PremblyVerifiedIdentity | null;
  failureReasons: string[];
  raw: {
    bvnFace?: PremblyEnvelope;
    docFace?: PremblyEnvelope;
  };
};

function resolveUploadPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(process.cwd(), normalized);
}

function readSelfieAsBase64(relativePath: string): string {
  const abs = resolveUploadPath(relativePath);
  if (!fs.existsSync(abs)) {
    throw ApiError.badRequest('Selfie file not found for Prembly verification');
  }
  return fs.readFileSync(abs).toString('base64');
}

/** Normalize Prembly confidence to 0–100 scale. */
export function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return Math.round(n * 10000) / 100;
  return n;
}

function extractFaceData(envelope: PremblyEnvelope): PremblyFaceData | null {
  if (envelope.face_data) return envelope.face_data;
  const data = envelope.data as any;
  if (data?.face_data) return data.face_data;
  return null;
}

function isApiSuccess(envelope: PremblyEnvelope): boolean {
  if (envelope.status === false) return false;
  const code = String(envelope.response_code || '');
  if (code && code !== '00' && code !== '0') return false;
  return true;
}

function facePassed(
  envelope: PremblyEnvelope,
  minConfidence: number
): { ok: boolean; confidence: number | null; message?: string } {
  const face = extractFaceData(envelope);
  const confidence = normalizeConfidence(face?.confidence);
  const faceOk = face?.status === true || String(face?.message || '').toLowerCase().includes('match');
  if (!isApiSuccess(envelope)) {
    return { ok: false, confidence, message: envelope.detail || envelope.message || 'Verification API failed' };
  }
  if (!faceOk) {
    return { ok: false, confidence, message: face?.message || 'Face does not match' };
  }
  if (confidence !== null && confidence < minConfidence) {
    return {
      ok: false,
      confidence,
      message: `Face match confidence ${confidence}% is below required ${minConfidence}%`,
    };
  }
  return { ok: true, confidence };
}

function pickNinPayload(envelope: PremblyEnvelope): any {
  return envelope.nin_data || envelope.data || {};
}

function pickBvnPayload(envelope: PremblyEnvelope): any {
  return envelope.data || {};
}

function pickDocPayload(envelope: PremblyEnvelope): any {
  return envelope.data || (envelope as any).frsc_data || {};
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, '')
    .replace(/\s+/g, ' ');
}

function namesLooselyMatch(submitted: string, official: string): boolean {
  const a = normalizeName(submitted);
  const b = normalizeName(official);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  const a0 = a.split(' ')[0];
  const b0 = b.split(' ')[0];
  return !!a0 && a0 === b0;
}

/** Convert various Prembly DOB formats to YYYY-MM-DD when possible. */
export function normalizePremblyDob(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ddmmyyyy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const mon = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
  if (mon) {
    const months: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    };
    const m = months[mon[2].slice(0, 3).toLowerCase()];
    if (m) return `${mon[3]}-${m}-${mon[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return s;
}

function dobsMatch(submitted: string, official: string | null | undefined): boolean {
  const a = normalizePremblyDob(submitted);
  const b = normalizePremblyDob(official);
  if (!a || !b) return true;
  return a === b;
}

/**
 * Tier 2: Prembly NIN + face only (Busha-ready identity).
 */
export async function verifyTier2WithPrembly(input: PremblyTier2Input): Promise<PremblyTier2Result> {
  if (!premblyConfig.isConfigured()) {
    throw ApiError.badRequest('Prembly is not configured on the server');
  }

  const nin = input.nin.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(nin)) throw ApiError.badRequest('NIN must be exactly 11 digits');

  const selfieBase64 = readSelfieAsBase64(input.selfieRelativePath);
  const minConfidence = premblyConfig.getMinFaceConfidence();
  const failureReasons: string[] = [];

  const ninFace = await premblyClient.verifyNinWithFace(nin, selfieBase64);
  const ninFaceResult = facePassed(ninFace, minConfidence);
  if (!ninFaceResult.ok) {
    failureReasons.push(`NIN face: ${ninFaceResult.message}`);
  }

  const ninPayload = pickNinPayload(ninFace);

  const officialFirst =
    ninPayload.firstname || ninPayload.firstName || ninPayload.first_name || input.firstName;
  const officialLast =
    ninPayload.surname || ninPayload.lastName || ninPayload.last_name || input.lastName;
  const officialDob =
    normalizePremblyDob(
      ninPayload.birthdate || ninPayload.birthDate || ninPayload.dateOfBirth || input.dob
    ) || input.dob;

  if (ninFaceResult.ok) {
    if (!namesLooselyMatch(input.firstName, String(officialFirst))) {
      failureReasons.push(
        `First name "${input.firstName}" does not match NIN record "${officialFirst}"`
      );
    }
    if (!namesLooselyMatch(input.lastName, String(officialLast))) {
      failureReasons.push(
        `Last name "${input.lastName}" does not match NIN record "${officialLast}"`
      );
    }
    if (!dobsMatch(input.dob, officialDob)) {
      failureReasons.push(
        `Date of birth "${input.dob}" does not match NIN record "${officialDob}"`
      );
    }
  }

  const nameOk = !failureReasons.some((r) => r.startsWith('First name') || r.startsWith('Last name'));
  const dobOk = !failureReasons.some((r) => r.startsWith('Date of birth'));
  const passed = ninFaceResult.ok && nameOk && dobOk;

  const verified: PremblyVerifiedIdentity | null = passed
    ? {
        firstName: String(officialFirst).trim(),
        lastName: String(officialLast).trim(),
        middleName: ninPayload.middlename || ninPayload.middleName || null,
        birthDate: officialDob,
        phone:
          input.phone ||
          ninPayload.telephoneno ||
          ninPayload.telephoneNo ||
          null,
        gender: ninPayload.gender || null,
        residentialAddress:
          ninPayload.residence_address || ninPayload.residenceAddress || null,
        nin,
      }
    : null;

  return {
    passed,
    ninFacePassed: ninFaceResult.ok,
    ninConfidence: ninFaceResult.confidence,
    reference: ninFace.verification?.reference || null,
    verified,
    failureReasons,
    raw: { ninFace },
  };
}

/**
 * Tier 3: Prembly BVN + face and passport/DL + face.
 */
export async function verifyTier3WithPrembly(input: PremblyTier3Input): Promise<PremblyTier3Result> {
  if (!premblyConfig.isConfigured()) {
    throw ApiError.badRequest('Prembly is not configured on the server');
  }

  const bvn = input.bvn.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(bvn)) throw ApiError.badRequest('BVN must be exactly 11 digits');
  if (!input.documentNumber?.trim()) throw ApiError.badRequest('Document number is required');
  if (input.documentType !== 'drivers_license' && input.documentType !== 'international_passport') {
    throw ApiError.badRequest('Document type must be drivers_license or international_passport');
  }

  const selfieBase64 = readSelfieAsBase64(input.selfieRelativePath);
  const minConfidence = premblyConfig.getMinFaceConfidence();
  const failureReasons: string[] = [];

  let bvnFace: PremblyEnvelope | undefined;
  let bvnFaceResult: { ok: boolean; confidence: number | null; message?: string } = {
    ok: false,
    confidence: null,
    message: 'BVN face not run',
  };
  try {
    bvnFace = await premblyClient.verifyBvnWithFace(bvn, selfieBase64);
    bvnFaceResult = facePassed(bvnFace, minConfidence);
    if (!bvnFaceResult.ok) {
      failureReasons.push(`BVN face: ${bvnFaceResult.message}`);
    }
  } catch (error: any) {
    failureReasons.push(`BVN face: ${error?.message || 'BVN verification failed'}`);
  }

  let docFace: PremblyEnvelope | undefined;
  let docFaceResult: { ok: boolean; confidence: number | null; message?: string } = {
    ok: false,
    confidence: null,
    message: 'Document face not run',
  };
  const docLabel = input.documentType === 'international_passport' ? 'Passport' : 'Drivers license';
  try {
    const docNumber = input.documentNumber.trim();
    if (input.documentType === 'international_passport') {
      docFace = await premblyClient.verifyPassportWithFace(input.lastName, docNumber, selfieBase64);
    } else {
      docFace = await premblyClient.verifyDriversLicenseWithFace(docNumber, input.dob, selfieBase64);
    }
    docFaceResult = facePassed(docFace, minConfidence);
    if (!docFaceResult.ok) {
      failureReasons.push(`${docLabel} face: ${docFaceResult.message}`);
    }
  } catch (error: any) {
    failureReasons.push(`${docLabel} face: ${error?.message || 'Document verification failed'}`);
  }

  const bvnPayload = bvnFace ? pickBvnPayload(bvnFace) : {};
  const docPayload = docFace ? pickDocPayload(docFace) : {};

  const officialFirst =
    bvnPayload.firstName ||
    bvnPayload.first_name ||
    docPayload.firstName ||
    docPayload.first_name ||
    input.firstName;
  const officialLast =
    bvnPayload.lastName ||
    bvnPayload.last_name ||
    docPayload.lastName ||
    docPayload.last_name ||
    input.lastName;
  const officialDob =
    normalizePremblyDob(
      bvnPayload.dateOfBirth ||
        bvnPayload.birthdate ||
        docPayload.birthDate ||
        docPayload.birthdate ||
        docPayload.dob ||
        input.dob
    ) || input.dob;

  if (bvnFaceResult.ok) {
    if (!namesLooselyMatch(input.firstName, String(officialFirst))) {
      failureReasons.push(
        `First name "${input.firstName}" does not match BVN record "${officialFirst}"`
      );
    }
    if (!namesLooselyMatch(input.lastName, String(officialLast))) {
      failureReasons.push(
        `Last name "${input.lastName}" does not match BVN record "${officialLast}"`
      );
    }
  }

  const submittedDob = normalizePremblyDob(input.dob);
  const registryDobs = [
    normalizePremblyDob(bvnPayload.dateOfBirth || bvnPayload.birthdate),
    normalizePremblyDob(docPayload.birthDate || docPayload.birthdate || docPayload.dob),
  ].filter(Boolean) as string[];

  if (submittedDob && registryDobs.length > 0 && !registryDobs.some((d) => d === submittedDob)) {
    failureReasons.push(
      `Date of birth "${input.dob}" does not match identity records (${registryDobs.join(', ')})`
    );
  }

  const nameOk = !failureReasons.some((r) => r.startsWith('First name') || r.startsWith('Last name'));
  const dobOk = !failureReasons.some((r) => r.startsWith('Date of birth'));
  const passed = bvnFaceResult.ok && docFaceResult.ok && nameOk && dobOk;

  const verified: PremblyVerifiedIdentity | null = passed
    ? {
        firstName: String(officialFirst).trim(),
        lastName: String(officialLast).trim(),
        middleName: bvnPayload.middleName || docPayload.middleName || null,
        birthDate: officialDob,
        phone: bvnPayload.phoneNumber1 || bvnPayload.phoneNumber || null,
        gender: bvnPayload.gender || docPayload.gender || null,
        residentialAddress: bvnPayload.residentialAddress || null,
        bvn,
      }
    : null;

  return {
    passed,
    bvnFacePassed: bvnFaceResult.ok,
    docFacePassed: docFaceResult.ok,
    bvnConfidence: bvnFaceResult.confidence,
    docConfidence: docFaceResult.confidence,
    reference:
      bvnFace?.verification?.reference || docFace?.verification?.reference || null,
    verified,
    failureReasons,
    raw: { bvnFace, docFace },
  };
}
