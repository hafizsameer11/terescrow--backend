/** Obiex currency codes → same upload icon paths as Busha/app assets. */

const ICON_CODES = new Set([
  'AAVE', 'ACT', 'ADA', 'ALGO', 'ALICE', 'APE', 'ARB', 'ARKM', 'ASTER', 'ATOM',
  'AVAX', 'AXS', 'BCH', 'BNB', 'BONK', 'BTC', 'BTT', 'C98', 'CAKE', 'CHZ',
  'CNGN', 'DOGE', 'DOGS', 'DOT', 'ENJ', 'ENS', 'ETH', 'FIL', 'FLOKI', 'GALA',
  'GBP', 'GRAM', 'GRASS', 'HIVE', 'HOME', 'HYPE', 'JUP', 'KAITO', 'KES', 'LINK',
  'LTC', 'LUNA', 'LUNC', 'MANA', 'MATIC', 'MELANIA', 'MEME', 'MET', 'NGN', 'NGNT',
  'NGNX', 'NOT', 'PENGU', 'PEPE', 'PI', 'PLUME', 'PNUT', 'POL', 'RLUSD', 'RMT',
  'S', 'SAND', 'SHIB', 'SLP', 'SOL', 'SUI', 'SUNDOG', 'TON', 'TRUMP', 'TRX',
  'TWT', 'UNI', 'USD', 'USDC', 'USDT', 'WIF', 'WIN', 'WLD', 'WLFI', 'XLM', 'XRP',
]);

const ICON_CODE_ALIASES: Record<string, string> = {
  TRON: 'TRX',
  USDT_TRON: 'USDT',
  USDT_BSC: 'USDT',
  USDT_ERC20: 'USDT',
  USDC_BSC: 'USDC',
  BSC: 'BNB',
  BEP20: 'BNB',
  TUSDT: 'USDT',
  NGNX: 'NGN',
  POLYGON: 'MATIC',
};

function resolveIconCode(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return '';
  if (ICON_CODES.has(normalized)) return normalized === 'NGNX' ? 'NGN' : normalized;
  const alias = ICON_CODE_ALIASES[normalized];
  if (alias && ICON_CODES.has(alias)) return alias;
  // Strip network suffix e.g. USDT-TRC20
  const base = normalized.split(/[-_]/)[0];
  if (base && ICON_CODES.has(base)) return base;
  return normalized;
}

/** Path under /uploads — same folder naming as Busha icons for visual parity. */
export function getObiexIconPath(code: string): string | null {
  const c = resolveIconCode(code);
  if (!c || !ICON_CODES.has(c)) return null;
  return `busha_icons/${c}.png`;
}

export function normalizeObiexCurrencyCode(code: string): string {
  return String(code || '').trim().toUpperCase().replace(/^NGNX$/, 'NGNX');
}
