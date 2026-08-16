import fs from 'fs';
import path from 'path';
import { premblyClient, PremblyEnvelope, PremblyFaceData } from './prembly.client';
import { premblyConfig } from './prembly.config';
import ApiError from '../../utils/ApiError';

export type PremblyTier2Input = {
  firstName: string;
  lastName: string;
  dob: string;
  nin: string;
  bvn: string;
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
  nin: string;
  bvn: string;
};

export type PremblyTier2Result = {
  passed: boolean;
  autoApproved: boolean;
  ninFacePassed: boolean;
  bvnFacePassed: boolean;
  ninConfidence: number | null;
  bvnConfidence: number | null;
  reference: string | null;
  verified: PremblyVerifiedIdentity | null;
  failureReasons: string[];
  raw: {
    ninFace?: PremblyEnvelope;
    bvnFace?: PremblyEnvelope;
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
  if (n >= 0 && n <= 1) return Math.round(n * 10000) / 100; // 0.995 → 99.5
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
  return envelope.status !== false;
}

function facePassed(envelope: PremblyEnvelope, minConfidence: number): { ok: boolean; confidence: number | null; message?: string } {
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
  const data = envelope.data || {};
  return data;
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
  // Allow official containing submitted or first token match
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
  // e.g. 01-Jan-2000 or 10-sep-2000
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

/**
 * Run Prembly NIN+face and BVN+face for Tier 2.
 * Uses selfie against both registries.
 */
export async function verifyTier2WithPrembly(input: PremblyTier2Input): Promise<PremblyTier2Result> {
  if (!premblyConfig.isConfigured()) {
    throw ApiError.badRequest('Prembly is not configured on the server');
  }

  const nin = input.nin.replace(/\s+/g, '');
  const bvn = input.bvn.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(nin)) throw ApiError.badRequest('NIN must be exactly 11 digits');
  if (!/^\d{11}$/.test(bvn)) throw ApiError.badRequest('BVN must be exactly 11 digits');

  const selfieBase64 = readSelfieAsBase64(input.selfieRelativePath);
  const minConfidence = premblyConfig.getMinFaceConfidence();
  const failureReasons: string[] = [];

  const ninFace = await premblyClient.verifyNinWithFace(nin, selfieBase64);
  const ninFaceResult = facePassed(ninFace, minConfidence);
  if (!ninFaceResult.ok) {
    failureReasons.push(`NIN face: ${ninFaceResult.message}`);
  }

  let bvnFace: PremblyEnvelope | undefined;
  let bvnFaceResult = { ok: false, confidence: null as number | null, message: 'BVN face not run' };
  try {
    bvnFace = await premblyClient.verifyBvnWithFace(bvn, selfieBase64);
    bvnFaceResult = facePassed(bvnFace, minConfidence);
    if (!bvnFaceResult.ok) {
      failureReasons.push(`BVN face: ${bvnFaceResult.message}`);
    }
  } catch (error: any) {
    failureReasons.push(`BVN face: ${error?.message || 'BVN verification failed'}`);
  }

  const ninPayload = pickNinPayload(ninFace);
  const bvnPayload = bvnFace ? pickBvnPayload(bvnFace) : {};

  const officialFirst =
    ninPayload.firstname ||
    ninPayload.firstName ||
    ninPayload.first_name ||
    bvnPayload.firstName ||
    bvnPayload.first_name ||
    input.firstName;
  const officialLast =
    ninPayload.surname ||
    ninPayload.lastName ||
    ninPayload.last_name ||
    bvnPayload.lastName ||
    bvnPayload.last_name ||
    input.lastName;
  const officialDob =
    normalizePremblyDob(
      ninPayload.birthdate ||
        ninPayload.birthDate ||
        ninPayload.dateOfBirth ||
        bvnPayload.dateOfBirth ||
        bvnPayload.birthdate ||
        input.dob
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
  }

  const ninOk = ninFaceResult.ok && failureReasons.every((r) => !r.startsWith('First name') && !r.startsWith('Last name') && !r.startsWith('NIN face'));
  // Recompute: passed requires both face checks and no name mismatches
  const nameOk =
    !failureReasons.some((r) => r.startsWith('First name') || r.startsWith('Last name'));
  const passed = ninFaceResult.ok && bvnFaceResult.ok && nameOk;

  const reference =
    ninFace.verification?.reference ||
    bvnFace?.verification?.reference ||
    null;

  const verified: PremblyVerifiedIdentity | null = passed
    ? {
        firstName: String(officialFirst).trim(),
        lastName: String(officialLast).trim(),
        middleName:
          ninPayload.middlename ||
          ninPayload.middleName ||
          bvnPayload.middleName ||
          null,
        birthDate: officialDob,
        phone: ninPayload.telephoneno || bvnPayload.phoneNumber1 || null,
        gender: ninPayload.gender || bvnPayload.gender || null,
        residentialAddress:
          ninPayload.residence_address ||
          ninPayload.residenceAddress ||
          bvnPayload.residentialAddress ||
          null,
        nin,
        bvn,
      }
    : null;

  return {
    passed,
    autoApproved: passed && premblyConfig.autoApproveOnPass(),
    ninFacePassed: ninFaceResult.ok,
    bvnFacePassed: bvnFaceResult.ok,
    ninConfidence: ninFaceResult.confidence,
    bvnConfidence: bvnFaceResult.confidence,
    reference,
    verified,
    failureReasons,
    raw: { ninFace, bvnFace },
  };
}
