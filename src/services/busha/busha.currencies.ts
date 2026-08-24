/**
 * Busha customer deposit/withdrawal cryptos from
 * https://docs.busha.io/guides/reference/supported-currencies
 *
 * Only assets with deposit/withdraw support are listed (shown in the app).
 * Network codes are the parenthetical values Busha uses in pay_in / pay_out
 * (e.g. USDT-TRC20 → TRX). USDT defaults to TRX so TRC20 can be tested first.
 *
 * App surfaces (assets, buy, sell, receive, swap) show the full catalog below.
 */

import { getBushaIconPath } from './busha.icons';
import {
  getBushaCryptoCatalogSync,
  refreshBushaCryptoCatalog,
} from './busha.catalog.service';
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

/** @deprecated Use live catalog from refreshBushaCryptoCatalog(); kept for tests/seeds. */
export const BUSHA_CRYPTO_ASSETS: BushaCryptoAsset[] = [
  ...(BUSHA_CRYPTO_ASSETS_FALLBACK as BushaCryptoAsset[]),
];

export const BUSHA_CRYPTO_CURRENCIES = BUSHA_CRYPTO_ASSETS.map((asset) => asset.code);

export function getBushaCryptoCurrencyCodes(): string[] {
  return getBushaCryptoCatalogSync().map((asset) => asset.code);
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
  const normalized = code.toUpperCase();
  return getBushaCryptoCatalogSync().find((asset) => asset.code === normalized);
}

export function resolveBushaNetwork(currency: string, requested?: string): string {
  const asset = getBushaCryptoAsset(currency);
  if (!asset) {
    throw new Error(
      `${currency.toUpperCase()} is not a Busha deposit/withdrawal currency. Supported: ${getBushaCryptoCurrencyCodes().join(', ')}`
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

export async function getBushaCurrenciesForAdmin() {
  const assets = await refreshBushaCryptoCatalog();
  const codes = assets.map((asset) => asset.code);
  const rampCrypto = assets.filter((asset) => asset.rampBuy || asset.rampSell).map((asset) => asset.code);
  const networks = Object.fromEntries(assets.map((asset) => [asset.code, asset.networks]));
  const networkDefaults = Object.fromEntries(assets.map((asset) => [asset.code, asset.defaultNetwork]));

  return {
    fiat: [...BUSHA_FIAT_CURRENCIES],
    crypto: codes,
    rampCrypto,
    networks: networkDefaults,
    networksByCurrency: networks,
    assets: assets.map((asset) => withBushaIcon(asset, asset.code)),
  };
}
