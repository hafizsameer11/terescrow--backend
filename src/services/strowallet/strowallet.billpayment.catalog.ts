import { getStroWalletBillerIcon } from './strowallet.billpayment.logos';

export type StroWalletSceneCode = 'airtime' | 'data' | 'electricity' | 'cable' | 'education';

export type StroWalletBiller = {
  billerId: string;
  billerName: string;
  billerIcon?: string;
  minAmount: number | null;
  maxAmount: number | null;
  status: number;
  serviceId?: string;
  meterType?: 'prepaid' | 'postpaid';
};

const AIRTIME_NETWORKS = [
  { billerId: 'MTN', billerName: 'MTN', serviceName: 'mtn', minAmount: 5000, maxAmount: 5000000 },
  { billerId: 'GLO', billerName: 'GLO', serviceName: 'glo', minAmount: 5000, maxAmount: 5000000 },
  { billerId: 'AIRTEL', billerName: 'Airtel', serviceName: 'airtel', minAmount: 5000, maxAmount: 5000000 },
  { billerId: '9MOBILE', billerName: '9mobile', serviceName: 'etisalat', minAmount: 5000, maxAmount: 5000000 },
] as const;

const DATA_NETWORKS = [
  { billerId: 'MTN', billerName: 'MTN', serviceId: 'mtn-data' },
  { billerId: 'GLO', billerName: 'GLO', serviceId: 'glo-data' },
  { billerId: 'AIRTEL', billerName: 'Airtel', serviceId: 'airtel-data' },
  { billerId: '9MOBILE', billerName: '9mobile', serviceId: 'etisalat-data' },
] as const;

/** StroWallet electricity max (kobo) — ₦500,000 */
const ELECTRICITY_MAX_KOBO = 50_000_000;

/**
 * Per-disco minimums from StroWallet live probes (kobo).
 * Unconfirmed discos use ₦1,000 conservative default.
 */
const ELECTRICITY_DISCOS = [
  { serviceName: 'ikeja-electric', billerName: 'Ikeja Electric', minAmountKobo: 100_000 },
  { serviceName: 'eko-electric', billerName: 'Eko Electric', minAmountKobo: 100_000 },
  { serviceName: 'abuja-electric', billerName: 'Abuja Electric', minAmountKobo: 100_000 },
  { serviceName: 'ibadan-electric', billerName: 'Ibadan Electric', minAmountKobo: 200_000 },
  { serviceName: 'enugu-electric', billerName: 'Enugu Electric', minAmountKobo: 100_000 },
  { serviceName: 'benin-electric', billerName: 'Benin Electric', minAmountKobo: 100_000 },
  { serviceName: 'portharcourt-electric', billerName: 'Port Harcourt Electric', minAmountKobo: 100_000 },
  { serviceName: 'jos-electric', billerName: 'Jos Electric', minAmountKobo: 100_000 },
  { serviceName: 'kaduna-electric', billerName: 'Kaduna Electric', minAmountKobo: 120_000 },
  { serviceName: 'kano-electric', billerName: 'Kano Electric', minAmountKobo: 50_000 },
  { serviceName: 'aba-electric', billerName: 'Aba Electric', minAmountKobo: 100_000 },
  { serviceName: 'yola-electric', billerName: 'Yola Electric', minAmountKobo: 100_000 },
] as const;

const CABLE_PROVIDERS = [
  { billerId: 'dstv', billerName: 'DSTV' },
  { billerId: 'gotv', billerName: 'GOTV' },
  { billerId: 'startimes', billerName: 'Startimes' },
  { billerId: 'showmax', billerName: 'Showmax' },
] as const;

const EDUCATION_PRODUCTS = [
  {
    billerId: 'WAEC',
    billerName: 'WAEC Result Checker PIN',
    serviceName: 'waec',
    variationCode: 'waecdirect',
    amountNgn: 3500,
  },
] as const;

export function resolveBillPaymentProvider(
  sceneCode: string,
  explicitProvider?: string
): 'palmpay' | 'strowallet' | 'vtpass' {
  if (sceneCode === 'betting') return 'palmpay';
  if (explicitProvider === 'vtpass') return 'vtpass';
  return 'strowallet';
}

export function getStroWalletAirtimeBillers(): StroWalletBiller[] {
  return AIRTIME_NETWORKS.map((n) => ({
    billerId: n.billerId,
    billerName: n.billerName,
    billerIcon: getStroWalletBillerIcon('airtime', n.billerId, n.serviceName),
    minAmount: n.minAmount,
    maxAmount: n.maxAmount,
    status: 1,
    serviceId: n.serviceName,
  }));
}

export function getStroWalletDataBillers(): StroWalletBiller[] {
  return DATA_NETWORKS.map((n) => ({
    billerId: n.billerId,
    billerName: n.billerName,
    billerIcon: getStroWalletBillerIcon('data', n.billerId, n.serviceId),
    minAmount: null,
    maxAmount: null,
    status: 1,
    serviceId: n.serviceId,
  }));
}

export function getStroWalletElectricityBillers(): StroWalletBiller[] {
  const billers: StroWalletBiller[] = [];
  for (const disco of ELECTRICITY_DISCOS) {
    for (const meterType of ['prepaid', 'postpaid'] as const) {
      const billerId = `${disco.serviceName}:${meterType}`;
      billers.push({
        billerId,
        billerName: `${disco.billerName} (${meterType === 'prepaid' ? 'Prepaid' : 'Postpaid'})`,
        billerIcon: getStroWalletBillerIcon('electricity', billerId, disco.serviceName),
        minAmount: disco.minAmountKobo,
        maxAmount: ELECTRICITY_MAX_KOBO,
        status: 1,
        serviceId: disco.serviceName,
        meterType,
      });
    }
  }
  return billers;
}

export function getStroWalletCableBillers(): StroWalletBiller[] {
  return CABLE_PROVIDERS.map((n) => ({
    billerId: n.billerId,
    billerName: n.billerName,
    billerIcon: getStroWalletBillerIcon('cable', n.billerId, n.billerId),
    minAmount: null,
    maxAmount: null,
    status: 1,
    serviceId: n.billerId,
  }));
}

export function getStroWalletEducationBillers(): StroWalletBiller[] {
  return EDUCATION_PRODUCTS.map((n) => ({
    billerId: n.billerId,
    billerName: n.billerName,
    billerIcon: getStroWalletBillerIcon('education', n.billerId, n.serviceName),
    minAmount: Math.round(n.amountNgn * 100),
    maxAmount: Math.round(n.amountNgn * 100),
    status: 1,
    serviceId: n.serviceName,
  }));
}

export function getEducationProduct(billerId: string) {
  const found = EDUCATION_PRODUCTS.find((n) => n.billerId === billerId.toUpperCase());
  if (!found) throw new Error(`Unknown education product: ${billerId}`);
  return found;
}

export function mapCableBillerToServiceId(billerId: string): string {
  const found = CABLE_PROVIDERS.find((n) => n.billerId === billerId.toLowerCase());
  if (!found) throw new Error(`Unknown cable biller: ${billerId}`);
  return found.billerId;
}

export function mapAirtimeBillerToServiceName(billerId: string): string {
  const found = AIRTIME_NETWORKS.find((n) => n.billerId === billerId.toUpperCase());
  if (!found) throw new Error(`Unknown airtime biller: ${billerId}`);
  return found.serviceName;
}

export function mapDataBillerToServiceId(billerId: string): string {
  const found = DATA_NETWORKS.find((n) => n.billerId === billerId.toUpperCase());
  if (!found) throw new Error(`Unknown data biller: ${billerId}`);
  return found.serviceId;
}

export function parseElectricityBillerId(billerId: string): { serviceName: string; meterType: 'prepaid' | 'postpaid' } {
  const [serviceName, meterTypeRaw] = billerId.split(':');
  const meterType = (meterTypeRaw || 'prepaid').toLowerCase() as 'prepaid' | 'postpaid';
  if (meterType !== 'prepaid' && meterType !== 'postpaid') {
    throw new Error('Electricity billerId must include :prepaid or :postpaid');
  }
  return { serviceName, meterType };
}

/** Limits for a disco billerId (amounts in kobo). */
export function getElectricityBillerLimits(billerId: string): {
  minAmount: number;
  maxAmount: number;
} {
  const { serviceName } = parseElectricityBillerId(billerId);
  const disco = ELECTRICITY_DISCOS.find((d) => d.serviceName === serviceName);
  return {
    minAmount: disco?.minAmountKobo ?? 100_000,
    maxAmount: ELECTRICITY_MAX_KOBO,
  };
}

export function wrapPalmPayList<T>(items: T[]) {
  return {
    respCode: '0000',
    respMsg: 'success',
    data: items,
    status: true,
  };
}
