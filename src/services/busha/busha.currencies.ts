/**
 * Busha app catalog — cryptos with full NGN operations on Busha:
 * GET /v1/pairs?currency=NGN → is_buy_supported + is_sell_supported
 * GET /v1/currencies → deposit + withdraw on at least one network
 *
 * Do NOT filter by currency-network is_ramp_* flags; those miss working pairs (e.g. TRX).
 * Verified live: 2026-08-25
 */

import { getBushaIconPath } from './busha.icons';
import { BUSHA_CRYPTO_ASSETS_FALLBACK } from './busha.currencies.fallback';

export type BushaCryptoAsset = {
  code: string;
  name: string;
  networks: string[];
  defaultNetwork: string;
  deposit: boolean;
  withdraw: boolean;
  rampBuy: boolean;
  rampSell: boolean;
};

export const BUSHA_FIAT_CURRENCIES = ['NGN'] as const;

/** NGN buy/sell (pairs API) + wallet deposit/withdraw. */
export const BUSHA_CRYPTO_ASSETS: BushaCryptoAsset[] = [
  ...(BUSHA_CRYPTO_ASSETS_FALLBACK as BushaCryptoAsset[]),
];

export const BUSHA_CRYPTO_CURRENCIES = BUSHA_CRYPTO_ASSETS.map((asset) => asset.code);

export function getBushaCryptoCurrencyCodes(): string[] {
  return BUSHA_CRYPTO_ASSETS.map((asset) => asset.code);
}

export const BUSHA_RAMP_CRYPTO_CURRENCIES = BUSHA_CRYPTO_ASSETS.filter(
  (asset) => asset.rampBuy || asset.rampSell
).map((asset) => asset.code);

export const CRYPTO_NETWORKS: Record<string, string[]> = Object.fromEntries(
  BUSHA_CRYPTO_ASSETS.map((asset) => [asset.code, asset.networks])
);

export const CRYPTO_NETWORK: Record<string, string> = Object.fromEntries(
  BUSHA_CRYPTO_ASSETS.map((asset) => [asset.code, asset.defaultNetwork])
);

export function getBushaCryptoAsset(code: string): BushaCryptoAsset | undefined {
  return BUSHA_CRYPTO_ASSETS.find((asset) => asset.code === code.toUpperCase());
}

export function resolveBushaNetwork(currency: string, requested?: string): string {
  const asset = getBushaCryptoAsset(currency);
  if (!asset) {
    throw new Error(
      `${currency.toUpperCase()} is not a Busha deposit/withdrawal currency. Supported: ${BUSHA_CRYPTO_CURRENCIES.join(', ')}`
    );
  }

  const network = (requested || asset.defaultNetwork).toUpperCase();
  if (!asset.networks.includes(network)) {
    throw new Error(
      `${asset.code} does not support network ${network}. Use one of: ${asset.networks.join(', ')}`
    );
  }

  return network;
}

export function withBushaIcon<T extends Record<string, unknown>>(
  row: T,
  code?: string
): T & { iconUrl: string | null } {
  const currency = code || String(row.currency || row.code || '');
  return {
    ...row,
    iconUrl: getBushaIconPath(currency),
  };
}

export function getBushaCurrenciesForAdmin() {
  return {
    fiat: [...BUSHA_FIAT_CURRENCIES],
    crypto: [...BUSHA_CRYPTO_CURRENCIES],
    rampCrypto: [...BUSHA_RAMP_CRYPTO_CURRENCIES],
    networks: CRYPTO_NETWORK,
    networksByCurrency: CRYPTO_NETWORKS,
    assets: BUSHA_CRYPTO_ASSETS.map((asset) => withBushaIcon(asset, asset.code)),
  };
}
