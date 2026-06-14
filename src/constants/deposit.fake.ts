import { CryptoTxStatus } from '@prisma/client';
import { parseRejectReference } from './deposit.rejection.reasons';

/** ReceivedAsset.status — unlisted / scam token; never credited or disbursed. */
export const DEPOSIT_STATUS_FAKE_SCAM = 'fake_scam';

/** ReceivedAsset.status — on-chain verification pending; no credit yet. */
export const DEPOSIT_STATUS_PENDING_VERIFICATION = 'pending_verification';

/** CryptoTransaction.status — awaiting on-chain double verification. */
export const CRYPTO_TX_STATUS_PENDING_VERIFY = CryptoTxStatus.pending_verification;

/** CryptoTransaction.status — verify retries exhausted (admin review). */
export const CRYPTO_TX_STATUS_VERIFY_FAILED = CryptoTxStatus.verify_failed_timeout;

/** CryptoTransaction.status — on-book receive row for a fake deposit. */
export const CRYPTO_TX_STATUS_FAKE = 'fake';

/** CryptoTransaction.status — admin/system revoked (fraud reversal). */
export const CRYPTO_TX_STATUS_REVOKED = 'revoked';

export function normalizeDepositStatusKey(status: string | null | undefined): string {
  return (status || '').toLowerCase().replace(/[\s_-]/g, '');
}

export function isFakeScamDepositStatus(status: string | null | undefined): boolean {
  return normalizeDepositStatusKey(status) === 'fakescam';
}

export function isPendingVerificationDepositStatus(status: string | null | undefined): boolean {
  return normalizeDepositStatusKey(status) === 'pendingverification';
}

export function isPendingVerifyCryptoTxStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === CRYPTO_TX_STATUS_PENDING_VERIFY;
}

export function isVerifyFailedCryptoTxStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === CRYPTO_TX_STATUS_VERIFY_FAILED;
}

export function isFakeCryptoTxStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === CRYPTO_TX_STATUS_FAKE;
}

export function isRevokedCryptoTxStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === CRYPTO_TX_STATUS_REVOKED;
}

export function isRevokedOrFakeCryptoTxStatus(status: string | null | undefined): boolean {
  return isFakeCryptoTxStatus(status) || isRevokedCryptoTxStatus(status);
}

export function isFakeDepositRecord(input: {
  masterWalletStatus?: string | null;
  receivedAssetStatus?: string | null;
  cryptoTxStatus?: string | null;
}): boolean {
  return (
    isFakeScamDepositStatus(input.masterWalletStatus)
    || isFakeScamDepositStatus(input.receivedAssetStatus)
    || isRevokedOrFakeCryptoTxStatus(input.cryptoTxStatus)
  );
}

export function resolveDepositFlag(input: {
  masterWalletStatus?: string | null;
  receivedAssetStatus?: string | null;
  cryptoTxStatus?: string | null;
  rejectionReference?: string | null;
}): { flagged: boolean; flagReason: string | null; pendingVerification?: boolean } {
  if (
    isPendingVerificationDepositStatus(input.receivedAssetStatus)
    || isPendingVerifyCryptoTxStatus(input.cryptoTxStatus)
  ) {
    return { flagged: false, flagReason: 'pending_onchain_verification', pendingVerification: true };
  }
  if (isVerifyFailedCryptoTxStatus(input.cryptoTxStatus)) {
    return { flagged: true, flagReason: 'verify_failed_timeout' };
  }
  if (
    isFakeScamDepositStatus(input.masterWalletStatus)
    || isFakeScamDepositStatus(input.receivedAssetStatus)
  ) {
    const fromRef = parseRejectReference(input.rejectionReference);
    return { flagged: true, flagReason: fromRef ?? 'fake_scam_token' };
  }
  if (isFakeCryptoTxStatus(input.cryptoTxStatus)) {
    return { flagged: true, flagReason: 'fake_deposit' };
  }
  if (isRevokedCryptoTxStatus(input.cryptoTxStatus)) {
    return { flagged: true, flagReason: 'revoked_fraud' };
  }
  return { flagged: false, flagReason: null, pendingVerification: false };
}
