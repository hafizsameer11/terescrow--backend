/** Canonical deposit rejection / verification failure codes. */

export type DepositRejectionStage = 'scam_guard' | 'on_chain_verify' | 'system';

export type DepositRejectionCode =
  | 'unlisted_token_contract'
  | 'blocklisted_token_contract'
  | 'contract_mismatch'
  | 'missing_whitelist_contract'
  | 'transfer_not_found_on_chain'
  | 'amount_mismatch'
  | 'transaction_failed'
  | 'verify_failed_timeout'
  | 'user_banned'
  | 'unsupported_chain'
  | 'unknown';

export interface DepositRejectionInfo {
  code: DepositRejectionCode;
  stage: DepositRejectionStage;
  label: string;
  detail: string;
  isDefinitiveFraud: boolean;
  shouldBanUser: boolean;
}

const REJECTION_CATALOG: Record<string, Omit<DepositRejectionInfo, 'code' | 'stage'> & { stage: DepositRejectionStage }> = {
  unlisted_token_contract: {
    stage: 'scam_guard',
    label: 'Unlisted token contract',
    detail:
      'The webhook reported a token transfer whose contract address is not on the platform whitelist. No balance was credited.',
    isDefinitiveFraud: true,
    shouldBanUser: true,
  },
  blocklisted_token_contract: {
    stage: 'scam_guard',
    label: 'Blocklisted scam contract',
    detail:
      'The token contract matches an address on the scam contract blocklist. The deposit was rejected and not credited.',
    isDefinitiveFraud: true,
    shouldBanUser: true,
  },
  contract_mismatch: {
    stage: 'on_chain_verify',
    label: 'On-chain contract mismatch',
    detail:
      'On-chain verification found a different token contract than the one whitelisted for this wallet. This usually indicates a spoofed token deposit.',
    isDefinitiveFraud: true,
    shouldBanUser: true,
  },
  missing_whitelist_contract: {
    stage: 'on_chain_verify',
    label: 'Missing whitelist contract',
    detail:
      'A token deposit was received but no whitelisted contract could be resolved for verification.',
    isDefinitiveFraud: true,
    shouldBanUser: true,
  },
  transfer_not_found_on_chain: {
    stage: 'on_chain_verify',
    label: 'Transfer not found on-chain',
    detail:
      'The transaction exists but no inbound transfer to the deposit address was found in the explorer response. This may be indexing delay or a parser/API mismatch — retries continue.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
  amount_mismatch: {
    stage: 'on_chain_verify',
    label: 'Amount mismatch',
    detail:
      'The amount credited on-chain does not match the webhook amount within tolerance. The deposit was not credited until verification succeeds or times out.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
  transaction_failed: {
    stage: 'on_chain_verify',
    label: 'Failed on-chain transaction',
    detail: 'The blockchain transaction did not succeed (reverted or failed). No credit was applied.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
  verify_failed_timeout: {
    stage: 'on_chain_verify',
    label: 'Verification timed out',
    detail:
      'On-chain verification did not complete after all retry attempts. The deposit remains uncredited for admin review — this is not automatically treated as a scam token.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
  user_banned: {
    stage: 'system',
    label: 'User banned',
    detail: 'Deposit credit was skipped because the customer account is banned.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
  unsupported_chain: {
    stage: 'on_chain_verify',
    label: 'Unsupported chain for verification',
    detail: 'This blockchain is not configured in the on-chain verifier. Verification stays pending until supported.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  },
};

export function normalizeRejectionCode(raw: string | null | undefined): DepositRejectionCode {
  const code = (raw || '').trim().toLowerCase();
  if (code.startsWith('verify_')) {
    return normalizeRejectionCode(code.slice('verify_'.length));
  }
  if (code in REJECTION_CATALOG) return code as DepositRejectionCode;
  if (code.includes('contract_mismatch')) return 'contract_mismatch';
  if (code.includes('unlisted')) return 'unlisted_token_contract';
  if (code.includes('blocklist')) return 'blocklisted_token_contract';
  if (code.includes('amount')) return 'amount_mismatch';
  if (code.includes('not_found') || code.includes('transfer_not_found')) return 'transfer_not_found_on_chain';
  if (code.includes('timeout') || code.includes('max_attempt')) return 'verify_failed_timeout';
  return 'unknown';
}

export function encodeFailureReason(stage: DepositRejectionStage, code: string): string {
  return `${stage}:${normalizeRejectionCode(code)}`;
}

export function decodeFailureReason(failureReason: string | null | undefined): {
  stage: DepositRejectionStage | null;
  code: DepositRejectionCode;
} {
  const raw = (failureReason || '').trim();
  if (!raw) return { stage: null, code: 'unknown' };
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const stage = raw.slice(0, colon) as DepositRejectionStage;
    const code = normalizeRejectionCode(raw.slice(colon + 1));
    return { stage, code };
  }
  return { stage: null, code: normalizeRejectionCode(raw) };
}

export function getDepositRejectionInfo(
  failureReason: string | null | undefined,
  fallbackCode?: string | null
): DepositRejectionInfo {
  const decoded = decodeFailureReason(failureReason);
  const code = decoded.code !== 'unknown' ? decoded.code : normalizeRejectionCode(fallbackCode);
  const stage = decoded.stage ?? REJECTION_CATALOG[code]?.stage ?? 'system';
  const entry = REJECTION_CATALOG[code];
  if (entry) {
    return { code, ...entry };
  }
  return {
    code: 'unknown',
    stage,
    label: 'Rejected',
    detail: failureReason || fallbackCode || 'Deposit was rejected without a recorded reason.',
    isDefinitiveFraud: false,
    shouldBanUser: false,
  };
}

export function isDefinitiveFraudRejection(code: string | null | undefined): boolean {
  return getDepositRejectionInfo(null, code).isDefinitiveFraud;
}

export function shouldBanUserForRejection(code: string | null | undefined): boolean {
  return getDepositRejectionInfo(null, code).shouldBanUser;
}

/** Native coin verify issues retry — never auto-lock as scam token. */
export function shouldLockVerifyMismatchAsFakeScam(input: {
  subscriptionType?: string | null;
  isToken: boolean;
  reason?: string | null;
}): boolean {
  if (input.subscriptionType === 'INCOMING_NATIVE_TX') return false;
  if (!input.isToken) return false;
  return isDefinitiveFraudRejection(input.reason);
}

export const REJECT_REFERENCE_PREFIX = 'reject:';

export function buildRejectReference(code: string): string {
  return `${REJECT_REFERENCE_PREFIX}${normalizeRejectionCode(code)}`;
}

export function parseRejectReference(reference: string | null | undefined): DepositRejectionCode | null {
  const ref = (reference || '').trim();
  if (!ref.startsWith(REJECT_REFERENCE_PREFIX)) return null;
  return normalizeRejectionCode(ref.slice(REJECT_REFERENCE_PREFIX.length));
}
