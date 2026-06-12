import ApiError from '../../utils/ApiError';
import { CUSTOMER_GENERIC_ERROR_MESSAGE } from '../../utils/customerSafeError';
import { prisma } from '../../utils/prisma';

export interface PlatformOperationSettingsDto {
  palmpayWithdrawDisabled: boolean;
  cryptoOutsideSendDisabled: boolean;
}

const DEFAULTS: PlatformOperationSettingsDto = {
  palmpayWithdrawDisabled: false,
  cryptoOutsideSendDisabled: false,
};

let cached: PlatformOperationSettingsDto | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15_000;

function toDto(row: {
  palmpayWithdrawDisabled: boolean;
  cryptoOutsideSendDisabled: boolean;
}): PlatformOperationSettingsDto {
  return {
    palmpayWithdrawDisabled: row.palmpayWithdrawDisabled,
    cryptoOutsideSendDisabled: row.cryptoOutsideSendDisabled,
  };
}

async function getOrCreateRow() {
  let row = await prisma.platformOperationSettings.findFirst();
  if (!row) {
    row = await prisma.platformOperationSettings.create({ data: DEFAULTS });
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
  body: Partial<PlatformOperationSettingsDto>
): Promise<PlatformOperationSettingsDto> {
  const row = await getOrCreateRow();
  const data: Partial<PlatformOperationSettingsDto> = {};
  if (typeof body.palmpayWithdrawDisabled === 'boolean') {
    data.palmpayWithdrawDisabled = body.palmpayWithdrawDisabled;
  }
  if (typeof body.cryptoOutsideSendDisabled === 'boolean') {
    data.cryptoOutsideSendDisabled = body.cryptoOutsideSendDisabled;
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
