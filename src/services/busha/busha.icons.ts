/** Auto-generated Busha currency icon paths under /uploads. */

export const BUSHA_ICON_CODES = new Set([
  'AAVE',
  'ACT',
  'ADA',
  'ALGO',
  'ALICE',
  'APE',
  'ARB',
  'ARKM',
  'ASTER',
  'ATOM',
  'AVAX',
  'AXS',
  'BCH',
  'BNB',
  'BONK',
  'BTC',
  'BTT',
  'C98',
  'CAKE',
  'CHZ',
  'CNGN',
  'DOGE',
  'DOGS',
  'DOT',
  'ENJ',
  'ENS',
  'ETH',
  'FIL',
  'FLOKI',
  'GALA',
  'GBP',
  'GRAM',
  'GRASS',
  'HIVE',
  'HOME',
  'HYPE',
  'JUP',
  'KAITO',
  'KES',
  'LINK',
  'LTC',
  'LUNA',
  'LUNC',
  'MANA',
  'MATIC',
  'MELANIA',
  'MEME',
  'MET',
  'NGN',
  'NGNT',
  'NOT',
  'PENGU',
  'PEPE',
  'PI',
  'PLUME',
  'PNUT',
  'POL',
  'RLUSD',
  'RMT',
  'S',
  'SAND',
  'SHIB',
  'SLP',
  'SOL',
  'SUI',
  'SUNDOG',
  'TON',
  'TRUMP',
  'TRX',
  'TWT',
  'UNI',
  'USD',
  'USDC',
  'USDT',
  'WIF',
  'WIN',
  'WLD',
  'WLFI',
  'XLM',
  'XRP',
]);

/** Legacy Tatum / wallet_currencies codes → Busha icon filename. */
const ICON_CODE_ALIASES: Record<string, string> = {
  TRON: 'TRX',
  USDT_TRON: 'USDT',
  USDT_BSC: 'USDT',
  USDC_BSC: 'USDC',
  BSC: 'BNB',
  TUSDT: 'USDT',
};

function resolveIconCode(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return '';
  if (BUSHA_ICON_CODES.has(normalized)) return normalized;
  const alias = ICON_CODE_ALIASES[normalized];
  if (alias && BUSHA_ICON_CODES.has(alias)) return alias;
  return normalized;
}

export function getBushaIconPath(code: string): string | null {
  const c = resolveIconCode(code);
  if (!c || !BUSHA_ICON_CODES.has(c)) return null;
  return `busha_icons/${c}.png`;
}
