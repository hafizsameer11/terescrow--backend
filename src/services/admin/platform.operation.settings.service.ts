import ApiError from '../../utils/ApiError';
import { CUSTOMER_GENERIC_ERROR_MESSAGE } from '../../utils/customerSafeError';
import { prisma } from '../../utils/prisma';

export type BillPaymentFeeLabel = 'merchant_fee' | 'profit';

export interface PlatformOperationSettingsDto {
  palmpayWithdrawDisabled: boolean;
  cryptoOutsideSendDisabled: boolean;
  billPaymentFeePercent: number;
  billPaymentFeeLabel: BillPaymentFeeLabel;
}

const DEFAULTS: PlatformOperationSettingsDto = {
  palmpayWithdrawDisabled: false,
  cryptoOutsideSendDisabled: false,
  billPaymentFeePercent: 0,
  billPaymentFeeLabel: 'merchant_fee',
};

let cached: PlatformOperationSettingsDto | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15_000;

function parseFeePercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 10000) / 10000;
}

function parseFeeLabel(value: unknown): BillPaymentFeeLabel {
  const s = String(value || '').toLowerCase().trim();
  return s === 'profit' ? 'profit' : 'merchant_fee';
}

function toDto(row: {
  palmpayWithdrawDisabled: boolean;
  cryptoOutsideSendDisabled: boolean;
  billPaymentFeePercent?: any;
  billPaymentFeeLabel?: string | null;
}): PlatformOperationSettingsDto {
  return {
    palmpayWithdrawDisabled: row.palmpayWithdrawDisabled,
    cryptoOutsideSendDisabled: row.cryptoOutsideSendDisabled,
    billPaymentFeePercent: parseFeePercent(row.billPaymentFeePercent),
    billPaymentFeeLabel: parseFeeLabel(row.billPaymentFeeLabel),
  };
}

async function getOrCreateRow() {
  let row = await prisma.platformOperationSettings.findFirst();
  if (!row) {
    row = await prisma.platformOperationSettings.create({
      data: {
        palmpayWithdrawDisabled: DEFAULTS.palmpayWithdrawDisabled,
        cryptoOutsideSendDisabled: DEFAULTS.cryptoOutsideSendDisabled,
        billPaymentFeePercent: DEFAULTS.billPaymentFeePercent,
        billPaymentFeeLabel: DEFAULTS.billPaymentFeeLabel,
      },
    });
  }
  return row;
}

export async function getPlatformOperationSettings(): Promise<PlatformOperationSettingsDto> {
  const now = Date.now();
  if (cached && now < cacheExpiresAt) {
    return cached;
  }
  const row = await getOrCreateRow();
  cached = toDto(row);
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cached;
}

export async function updatePlatformOperationSettings(
  body: Partial<{
    palmpayWithdrawDisabled: boolean;
    cryptoOutsideSendDisabled: boolean;
    billPaymentFeePercent: number | string;
    billPaymentFeeLabel: string;
  }>
): Promise<PlatformOperationSettingsDto> {
  const row = await getOrCreateRow();
  const data: Record<string, unknown> = {};
  if (typeof body.palmpayWithdrawDisabled === 'boolean') {
    data.palmpayWithdrawDisabled = body.palmpayWithdrawDisabled;
  }
  if (typeof body.cryptoOutsideSendDisabled === 'boolean') {
    data.cryptoOutsideSendDisabled = body.cryptoOutsideSendDisabled;
  }
  if (body.billPaymentFeePercent !== undefined && body.billPaymentFeePercent !== null) {
    data.billPaymentFeePercent = parseFeePercent(body.billPaymentFeePercent);
  }
  if (body.billPaymentFeeLabel !== undefined && body.billPaymentFeeLabel !== null) {
    data.billPaymentFeeLabel = parseFeeLabel(body.billPaymentFeeLabel);
  }
  const updated = await prisma.platformOperationSettings.update({
    where: { id: row.id },
    data,
  });
  cached = toDto(updated);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cached;
}

export async function assertPalmpayWithdrawEnabled(): Promise<void> {
  const settings = await getPlatformOperationSettings();
  if (settings.palmpayWithdrawDisabled) {
    throw ApiError.internal(CUSTOMER_GENERIC_ERROR_MESSAGE);
  }
}

export async function assertCryptoOutsideSendEnabled(): Promise<void> {
  const settings = await getPlatformOperationSettings();
  if (settings.cryptoOutsideSendDisabled) {
    throw ApiError.internal(CUSTOMER_GENERIC_ERROR_MESSAGE);
  }
}

/** Bill amount user pays = provider amount + merchant fee. Returns fee breakdown. */
export async function computeBillPaymentCharge(providerAmountNgn: number): Promise<{
  providerAmountNgn: number;
  feePercent: number;
  feeLabel: BillPaymentFeeLabel;
  feeNgn: number;
  totalDebitNgn: number;
}> {
  const settings = await getPlatformOperationSettings();
  const providerAmount = Number.isFinite(providerAmountNgn) && providerAmountNgn > 0 ? providerAmountNgn : 0;
  const feePercent = settings.billPaymentFeePercent;
  const feeNgn =
    feePercent > 0 ? Math.round(providerAmount * (feePercent / 100) * 100) / 100 : 0;
  return {
    providerAmountNgn: Math.round(providerAmount * 100) / 100,
    feePercent,
    feeLabel: settings.billPaymentFeeLabel,
    feeNgn,
    totalDebitNgn: Math.round((providerAmount + feeNgn) * 100) / 100,
  };
}
