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

export const BUSHA_CRYPTO_ASSETS: BushaCryptoAsset[] = [
  {
    code: 'USDT',
    name: 'Tether',
    networks: ['TRX', 'ETH', 'BSC', 'SOL', 'XPL'],
    defaultNetwork: 'TRX',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'TRX',
    name: 'Tron',
    networks: ['TRX'],
    defaultNetwork: 'TRX',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'BTC',
    name: 'Bitcoin',
    networks: ['BTC'],
    defaultNetwork: 'BTC',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    networks: ['ETH', 'BASE'],
    defaultNetwork: 'ETH',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'USDC',
    name: 'USD Coin',
    networks: ['TRX', 'ETH', 'BASE', 'SOL', 'XLM'],
    defaultNetwork: 'TRX',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'BNB',
    name: 'BNB',
    networks: ['BSC'],
    defaultNetwork: 'BSC',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'SOL',
    name: 'Solana',
    networks: ['SOL'],
    defaultNetwork: 'SOL',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'TON',
    name: 'Toncoin',
    networks: ['TON'],
    defaultNetwork: 'TON',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'LTC',
    name: 'Litecoin',
    networks: ['LTC'],
    defaultNetwork: 'LTC',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'XRP',
    name: 'Ripple',
    networks: ['XRP'],
    defaultNetwork: 'XRP',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'XLM',
    name: 'Stellar',
    networks: ['XLM'],
    defaultNetwork: 'XLM',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'POL',
    name: 'Polygon',
    networks: ['MATIC'],
    defaultNetwork: 'MATIC',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'SHIB',
    name: 'SHIBA INU',
    networks: ['ETH'],
    defaultNetwork: 'ETH',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'MC',
    name: 'MC Token',
    networks: ['ETH'],
    defaultNetwork: 'ETH',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
  {
    code: 'TRUMP',
    name: 'Official Trump',
    networks: ['SOL'],
    defaultNetwork: 'SOL',
    deposit: true,
    withdraw: true,
    rampBuy: true,
    rampSell: true,
  },
];

export const BUSHA_CRYPTO_CURRENCIES = BUSHA_CRYPTO_ASSETS.map((asset) => asset.code);

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
