import { bushaClient, type BushaCurrency, type BushaCurrencyNetwork } from './busha.client';
import type { BushaCryptoAsset } from './busha.currencies';
import { BUSHA_CRYPTO_ASSETS_FALLBACK } from './busha.currencies.fallback';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedCatalog: BushaCryptoAsset[] = [...(BUSHA_CRYPTO_ASSETS_FALLBACK as BushaCryptoAsset[])];
let cacheExpiresAt = 0;
let refreshPromise: Promise<BushaCryptoAsset[]> | null = null;

function networkSupportsDepositWithdraw(network: BushaCurrencyNetwork): boolean {
  const deposit = !!network.deposit;
  const withdraw = !!(network.withdrawal ?? network.withdraw);
  const status = String(network.status || 'active').toLowerCase();
  return deposit && withdraw && status === 'active';
}

function mapBushaCurrency(currency: BushaCurrency): BushaCryptoAsset | null {
  const code = String(currency.code || '').trim().toUpperCase();
  if (!code || String(currency.type || '').toLowerCase() === 'fiat') return null;

  const networks = (currency.supported_networks || currency.networks || []) as BushaCurrencyNetwork[];
  const activeNetworks = networks.filter(networkSupportsDepositWithdraw);
  const networkCodes = [
    ...new Set(
      activeNetworks
        .map((network) => String(network.network || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  const canDeposit = !!(currency as { deposit?: boolean }).deposit || activeNetworks.some((n) => n.deposit);
  const canWithdraw =
    !!(currency as { withdrawal?: boolean }).withdrawal ||
    activeNetworks.some((n) => n.withdrawal || n.withdraw);

  if (!canDeposit || !canWithdraw || !networkCodes.length) return null;

  const defaultRaw = String((currency as { default_network?: string }).default_network || '')
    .trim()
    .toUpperCase();
  const defaultNetwork =
    defaultRaw && networkCodes.includes(defaultRaw) ? defaultRaw : networkCodes[0];

  return {
    code,
    name: String(currency.name || (currency as { display_name?: string }).display_name || code),
    networks: networkCodes,
    defaultNetwork,
    deposit: true,
    withdraw: true,
    rampBuy: activeNetworks.some((network) => network.is_ramp_buy_supported),
    rampSell: activeNetworks.some((network) => network.is_ramp_sell_supported),
  };
}

export function getBushaCryptoCatalogSync(): BushaCryptoAsset[] {
  return cachedCatalog;
}

export async function refreshBushaCryptoCatalog(force = false): Promise<BushaCryptoAsset[]> {
  const now = Date.now();
  if (!force && cachedCatalog.length && now < cacheExpiresAt) {
    return cachedCatalog;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const rows = await bushaClient.listCurrencies();
      const mapped = rows
        .map(mapBushaCurrency)
        .filter((asset): asset is BushaCryptoAsset => !!asset)
        .sort((a, b) => a.code.localeCompare(b.code));

      if (mapped.length) {
        cachedCatalog = mapped;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      }
      return cachedCatalog;
    } catch {
      return cachedCatalog;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

void refreshBushaCryptoCatalog(true);
