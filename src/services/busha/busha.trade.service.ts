import ApiError from '../../utils/ApiError';
import { bushaConfig } from './busha.config';
import { prisma } from '../../utils/prisma';
import type { BushaSellPayoutMode } from '../admin/busha.admin.service';

const bushaConfigModel = (prisma as any).bushaConfig;

export const BUSHA_COMPLETED_STATUSES = new Set([
  'completed',
  'funds_converted',
  'funds_delivered',
]);

export function assertBushaApiConfigured() {
  if (!bushaConfig.isConfigured()) {
    throw ApiError.badRequest('Busha is not configured. Set BUSHA_API_KEY in server .env.');
  }
}

export async function getBushaConfigRow() {
  return bushaConfigModel.findUnique({ where: { id: 1 } });
}

export async function assertBushaAppActive() {
  assertBushaApiConfigured();
  const settings = await getBushaConfigRow();
  if (!settings?.isActive) {
    throw ApiError.badRequest('Busha app integration is not active. Enable it in admin Busha settings.');
  }
  return settings;
}

export async function getSellPayoutMode(): Promise<BushaSellPayoutMode> {
  const settings = await getBushaConfigRow();
  const mode = (settings?.sellPayoutMode || 'palmpay_temp') as string;
  return mode === 'dashboard_bank' ? 'dashboard_bank' : 'palmpay_temp';
}

/** Re-export trade operations from admin service (shared core). */
export {
  previewBushaQuote,
  prepareBushaSellPalmpayPayout,
  executeBushaSell,
  executeBushaBuy,
  executeBushaCryptoReceive,
  executeBushaCryptoSend,
  getBushaCustomerWallet,
  getBushaCustomerBalance,
  listBushaCustomerTransfers,
  getBushaCustomerTransfer,
  getBushaCustomerQuote,
  listBushaCustomerRecipients,
  getBushaTrade,
  refreshBushaTrade,
  submitBushaCustomerKyc,
  verifyBushaCustomer,
  refreshBushaCustomer,
  getBushaCustomer,
  syncBushaPayoutRecipient,
  createDashboardBankRecipientOnProfile,
} from '../admin/busha.admin.service';
