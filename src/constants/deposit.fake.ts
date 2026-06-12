/** ReceivedAsset.status — unlisted / scam token; never credited or disbursed. */
export const DEPOSIT_STATUS_FAKE_SCAM = 'fake_scam';

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
