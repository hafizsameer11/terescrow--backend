/**
 * Static biller logos for StroWallet bill-payment catalogs.
 * StroWallet does not return icons; we map known billers to /uploads/billpayment/*.png.
 */

const DEFAULT_PUBLIC_BASE = 'https://backend.tercescrow.site';

const AIRTIME_DATA_ICONS: Record<string, string> = {
  MTN: 'mtn.png',
  GLO: 'glo.png',
  AIRTEL: 'airtel.png',
  '9MOBILE': '9mobile.png',
};

const CABLE_ICONS: Record<string, string> = {
  dstv: 'dstv.png',
  gotv: 'gotv.png',
  startimes: 'startimes.png',
  showmax: 'showmax.png',
};

const EDUCATION_ICONS: Record<string, string> = {
  WAEC: 'waec.png',
};

const ELECTRICITY_ICONS: Record<string, string> = {
  'ikeja-electric': 'ikeja-electric.png',
  'eko-electric': 'eko-electric.png',
  'abuja-electric': 'abuja-electric.png',
  'ibadan-electric': 'ibadan-electric.png',
  'enugu-electric': 'enugu-electric.png',
  'benin-electric': 'benin-electric.png',
  'portharcourt-electric': 'portharcourt-electric.png',
  'jos-electric': 'jos-electric.png',
  'kaduna-electric': 'kaduna-electric.png',
  'kano-electric': 'kano-electric.png',
  'aba-electric': 'aba-electric.png',
  'yola-electric': 'yola-electric.png',
};

function resolvePublicBaseUrl(): string {
  const raw =
    process.env.BASE_URL?.trim() ||
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    DEFAULT_PUBLIC_BASE;
  return raw.replace(/\/$/, '');
}

function buildIconUrl(filename: string): string {
  const base = resolvePublicBaseUrl();
  return `${base}/uploads/billpayment/${filename}`;
}

/**
 * Resolve absolute billerIcon URL for a StroWallet catalog biller.
 * Betting is PalmPay — intentionally returns undefined.
 */
export function getStroWalletBillerIcon(
  sceneCode: string,
  billerId: string,
  serviceId?: string
): string | undefined {
  const scene = String(sceneCode || '').toLowerCase();
  if (scene === 'betting') return undefined;

  const id = String(billerId || '').trim();
  if (!id) return undefined;

  if (scene === 'airtime' || scene === 'data') {
    const file = AIRTIME_DATA_ICONS[id.toUpperCase()];
    return file ? buildIconUrl(file) : undefined;
  }

  if (scene === 'cable') {
    const file = CABLE_ICONS[id.toLowerCase()];
    return file ? buildIconUrl(file) : undefined;
  }

  if (scene === 'education') {
    const file = EDUCATION_ICONS[id.toUpperCase()];
    return file ? buildIconUrl(file) : undefined;
  }

  if (scene === 'electricity') {
    const disco =
      (serviceId && String(serviceId).trim().toLowerCase()) ||
      id.split(':')[0].toLowerCase();
    const file = ELECTRICITY_ICONS[disco];
    return file ? buildIconUrl(file) : undefined;
  }

  return undefined;
}
