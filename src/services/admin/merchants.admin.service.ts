import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { palmpayConfig } from '../palmpay/palmpay.config';
import { palmpayMerchantService } from '../palmpay/palmpay.merchant.service';
import { palmpayPayout } from '../palmpay/palmpay.payout.service';
import { palmpayBanks } from '../palmpay/palmpay.banks.service';
import { strowalletBalanceService } from '../strowallet/strowallet.balance.service';
import { strowalletConfig } from '../strowallet/strowallet.config';

const strowalletConfigModel = (prisma as any).stroWalletConfig;
const merchantTopupLogModel = (prisma as any).merchantTopupLog;

export type TopupTrigger = 'manual' | 'auto';

/** Admin-editable top-up bank + auto-refill settings; API keys are in .env */
export type StroWalletTopupSettingsInput = {
  topupBankCode?: string | null;
  topupBankName?: string | null;
  topupAccountNumber?: string | null;
  topupAccountName?: string | null;
  isActive?: boolean;
  autoTopupEnabled?: boolean;
  autoTopupThresholdNgn?: number | null;
  autoTopupAmountNgn?: number | null;
  autoTopupCooldownMinutes?: number;
};

function mapTopupLog(t: any) {
  return {
    id: t.id,
    amount: t.amount?.toString?.() ?? String(t.amount),
    currency: t.currency,
    status: t.status,
    trigger: t.trigger || 'manual',
    balanceBeforeNgn:
      t.balanceBeforeNgn != null
        ? Number(t.balanceBeforeNgn.toString?.() ?? t.balanceBeforeNgn)
        : null,
    palmpayOrderId: t.palmpayOrderId,
    palmpayOrderNo: t.palmpayOrderNo,
    bankCode: t.bankCode,
    bankName: t.bankName,
    accountNumber: t.accountNumber,
    accountName: t.accountName,
    errorMessage: t.errorMessage,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    initiatedBy: t.initiatedBy,
  };
}

function autoSettingsFromRow(row: any) {
  return {
    autoTopupEnabled: !!row?.autoTopupEnabled,
    autoTopupThresholdNgn:
      row?.autoTopupThresholdNgn != null
        ? Number(row.autoTopupThresholdNgn.toString?.() ?? row.autoTopupThresholdNgn)
        : null,
    autoTopupAmountNgn:
      row?.autoTopupAmountNgn != null
        ? Number(row.autoTopupAmountNgn.toString?.() ?? row.autoTopupAmountNgn)
        : null,
    autoTopupCooldownMinutes: row?.autoTopupCooldownMinutes ?? 30,
  };
}

export async function getStroWalletTopupSettingsRow() {
  return strowalletConfigModel.findUnique({ where: { id: 1 } });
}

export async function upsertStroWalletTopupSettings(input: StroWalletTopupSettingsInput) {
  const parseOptionalAmount = (v: number | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null || v === ('' as any)) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw ApiError.badRequest('Auto top-up amounts must be non-negative numbers');
    }
    return n;
  };

  const threshold =
    input.autoTopupThresholdNgn !== undefined
      ? parseOptionalAmount(input.autoTopupThresholdNgn)
      : undefined;
  const amount =
    input.autoTopupAmountNgn !== undefined
      ? parseOptionalAmount(input.autoTopupAmountNgn)
      : undefined;

  let cooldown: number | undefined;
  if (input.autoTopupCooldownMinutes !== undefined) {
    const c = Math.floor(Number(input.autoTopupCooldownMinutes));
    if (!Number.isFinite(c) || c < 1 || c > 24 * 60) {
      throw ApiError.badRequest('Cooldown minutes must be between 1 and 1440');
    }
    cooldown = c;
  }

  if (input.autoTopupEnabled === true) {
    const existing = await getStroWalletTopupSettingsRow();
    const effectiveThreshold =
      threshold !== undefined ? threshold : existing?.autoTopupThresholdNgn != null
        ? Number(existing.autoTopupThresholdNgn)
        : null;
    const effectiveAmount =
      amount !== undefined ? amount : existing?.autoTopupAmountNgn != null
        ? Number(existing.autoTopupAmountNgn)
        : null;
    const bankOk =
      (input.topupBankCode !== undefined
        ? !!input.topupBankCode?.trim()
        : !!existing?.topupBankCode) &&
      (input.topupAccountNumber !== undefined
        ? !!input.topupAccountNumber?.trim()
        : !!existing?.topupAccountNumber);

    if (!bankOk) {
      throw ApiError.badRequest('Configure top-up bank account before enabling auto top-up');
    }
    if (effectiveThreshold == null || effectiveAmount == null || effectiveAmount <= 0) {
      throw ApiError.badRequest(
        'Set threshold and transfer amount (> 0) before enabling auto top-up'
      );
    }
  }

  return strowalletConfigModel.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      topupBankCode: input.topupBankCode?.trim() || null,
      topupBankName: input.topupBankName?.trim() || null,
      topupAccountNumber: input.topupAccountNumber?.trim() || null,
      topupAccountName: input.topupAccountName?.trim() || null,
      isActive: input.isActive ?? true,
      autoTopupEnabled: input.autoTopupEnabled ?? false,
      autoTopupThresholdNgn: threshold ?? null,
      autoTopupAmountNgn: amount ?? null,
      autoTopupCooldownMinutes: cooldown ?? 30,
    },
    update: {
      ...(input.topupBankCode !== undefined ? { topupBankCode: input.topupBankCode?.trim() || null } : {}),
      ...(input.topupBankName !== undefined ? { topupBankName: input.topupBankName?.trim() || null } : {}),
      ...(input.topupAccountNumber !== undefined
        ? { topupAccountNumber: input.topupAccountNumber?.trim() || null }
        : {}),
      ...(input.topupAccountName !== undefined
        ? { topupAccountName: input.topupAccountName?.trim() || null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.autoTopupEnabled !== undefined ? { autoTopupEnabled: input.autoTopupEnabled } : {}),
      ...(threshold !== undefined ? { autoTopupThresholdNgn: threshold } : {}),
      ...(amount !== undefined ? { autoTopupAmountNgn: amount } : {}),
      ...(cooldown !== undefined ? { autoTopupCooldownMinutes: cooldown } : {}),
    },
  });
}

export async function getMerchantsOverview() {
  const palmpayEnv = palmpayConfig.getConfig();
  let palmpayBalance = null;
  let palmpayBalanceError: string | null = null;
  try {
    palmpayBalance = await palmpayMerchantService.queryMerchantBalance();
  } catch (e: any) {
    palmpayBalanceError = e?.message || 'Failed to fetch PalmPay balance';
  }

  const strowalletEnv = strowalletConfig.getConfigForAdmin();
  const strowalletTopup = await getStroWalletTopupSettingsRow();
  let strowalletBalanceNgn = null;
  let strowalletBalanceUsd = null;
  let strowalletBalanceError: string | null = null;

  if (strowalletEnv.configured && (strowalletTopup?.isActive ?? true)) {
    try {
      strowalletBalanceNgn = await strowalletBalanceService.queryBalance(undefined, 'NGN');
    } catch (e: any) {
      strowalletBalanceError = e?.message || 'Failed to fetch StroWallet NGN balance';
    }
    try {
      strowalletBalanceUsd = await strowalletBalanceService.queryBalance(undefined, 'USD');
    } catch {
      // USD wallet may not exist — non-fatal
    }
  }

  const recentTopups = await merchantTopupLogModel.findMany({
    where: { merchant: 'strowallet' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  const auto = autoSettingsFromRow(strowalletTopup);

  return {
    palmpay: {
      id: 'palmpay',
      name: 'PalmPay',
      configured: !!(palmpayEnv.merchantId && palmpayEnv.appId),
      environment: palmpayEnv.environment,
      merchantId: palmpayEnv.merchantId,
      appId: palmpayEnv.appId,
      baseUrl: palmpayEnv.baseUrl,
      balance: palmpayBalance,
      balanceError: palmpayBalanceError,
      credentialsSource: 'env',
    },
    strowallet: {
      id: 'strowallet',
      name: 'StroWallet',
      configured: strowalletEnv.configured,
      isActive: strowalletTopup?.isActive ?? true,
      credentialsSource: 'env',
      publicKeyMasked: strowalletEnv.publicKeyMasked,
      secretKeyMasked: strowalletEnv.secretKeyMasked,
      hasSecretKey: strowalletEnv.hasSecretKey,
      merchantId: strowalletEnv.merchantId,
      websiteUrl: strowalletEnv.websiteUrl,
      baseUrl: strowalletEnv.baseUrl,
      topupBank: strowalletTopup
        ? {
            bankCode: strowalletTopup.topupBankCode,
            bankName: strowalletTopup.topupBankName,
            accountNumber: strowalletTopup.topupAccountNumber,
            accountName: strowalletTopup.topupAccountName,
          }
        : null,
      ...auto,
      balanceNgn: strowalletBalanceNgn,
      balanceUsd: strowalletBalanceUsd,
      balanceError: strowalletBalanceError,
      recentTopups: recentTopups.map(mapTopupLog),
    },
  };
}

export async function getStroWalletSettingsForAdmin() {
  const env = strowalletConfig.getConfigForAdmin();
  const row = await getStroWalletTopupSettingsRow();
  return {
    ...env,
    topupBankCode: row?.topupBankCode ?? '',
    topupBankName: row?.topupBankName ?? '',
    topupAccountNumber: row?.topupAccountNumber ?? '',
    topupAccountName: row?.topupAccountName ?? '',
    isActive: row?.isActive ?? true,
    ...autoSettingsFromRow(row),
    envKeys: {
      publicKey: 'STROWALLET_PUBLIC_KEY',
      secretKey: 'STROWALLET_SECRET_KEY',
      merchantId: 'STROWALLET_MERCHANT_ID',
      websiteUrl: 'STROWALLET_WEBSITE_URL',
      baseUrl: 'STROWALLET_BASE_URL',
    },
  };
}

export async function topUpStroWalletViaPalmpay(params: {
  amount: number;
  adminUserId?: number | null;
  trigger?: TopupTrigger;
  balanceBeforeNgn?: number | null;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
}) {
  if (!strowalletConfig.isConfigured()) {
    throw ApiError.badRequest(
      'StroWallet is not configured. Set STROWALLET_PUBLIC_KEY in server .env.'
    );
  }

  const config = await getStroWalletTopupSettingsRow();
  if (config && !config.isActive) {
    throw ApiError.badRequest('StroWallet top-up is disabled in settings.');
  }

  const trigger: TopupTrigger = params.trigger === 'auto' ? 'auto' : 'manual';
  const bankCode = (params.bankCode || config?.topupBankCode || '').trim();
  const accountNumber = (params.accountNumber || config?.topupAccountNumber || '').trim();
  const accountName = (params.accountName || config?.topupAccountName || 'StroWallet').trim();
  const bankName = (params.bankName || config?.topupBankName || '').trim();

  if (!bankCode || !accountNumber) {
    throw ApiError.badRequest(
      'Top-up bank account is required. Configure StroWallet payout bank details in Merchants settings.'
    );
  }

  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('Amount must be greater than 0');
  }

  const amountInCents = Math.round(amount * 100);
  if (amountInCents < 100) {
    throw ApiError.badRequest('Minimum top-up amount is ₦1.00');
  }

  if (trigger === 'manual' && !params.adminUserId) {
    throw ApiError.badRequest('Admin user required for manual top-up');
  }

  const orderId = `stw_topup_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

  const log = await merchantTopupLogModel.create({
    data: {
      id: uuidv4(),
      merchant: 'strowallet',
      amount,
      currency: 'NGN',
      bankCode,
      bankName: bankName || null,
      accountNumber,
      accountName: accountName || null,
      palmpayOrderId: orderId,
      status: 'pending',
      trigger,
      balanceBeforeNgn:
        params.balanceBeforeNgn != null && Number.isFinite(params.balanceBeforeNgn)
          ? params.balanceBeforeNgn
          : null,
      initiatedById: params.adminUserId ?? null,
    },
    include: {
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  try {
    const payout = await palmpayPayout.initiatePayout({
      orderId,
      title: trigger === 'auto' ? 'StroWallet auto top-up' : 'StroWallet top-up',
      description: `Top-up to StroWallet (${accountNumber})`,
      payeeName: accountName,
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      currency: 'NGN',
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark:
        trigger === 'auto'
          ? 'StroWallet merchant auto top-up'
          : `StroWallet merchant top-up by admin ${params.adminUserId}`,
    });

    const status =
      payout.orderStatus === 2 ? 'completed' : payout.orderStatus === 3 ? 'failed' : 'pending';

    const updated = await merchantTopupLogModel.update({
      where: { id: log.id },
      data: {
        palmpayOrderNo: payout.orderNo,
        palmpayStatus: String(payout.orderStatus),
        status,
        providerResponse: payout as any,
        ...(status === 'completed' ? { completedAt: new Date() } : {}),
        ...(status === 'failed'
          ? { errorMessage: 'PalmPay reported failed payout status' }
          : {}),
      },
      include: {
        initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    });

    return updated;
  } catch (error: any) {
    await merchantTopupLogModel.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        errorMessage: error?.message || 'PalmPay payout failed',
      },
    });
    throw ApiError.internal(error?.message || 'PalmPay payout failed');
  }
}

/**
 * Poller entry: if auto top-up enabled and StroWallet NGN ≤ threshold,
 * transfer fixed amount from PalmPay (with cooldown + PalmPay balance guard).
 */
export async function runStroWalletAutoTopupCheck(): Promise<{
  skipped: boolean;
  reason?: string;
  logId?: string;
}> {
  const config = await getStroWalletTopupSettingsRow();
  if (!config?.autoTopupEnabled) {
    return { skipped: true, reason: 'disabled' };
  }
  if (!config.isActive) {
    return { skipped: true, reason: 'strowallet_inactive' };
  }
  if (!strowalletConfig.isConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const threshold =
    config.autoTopupThresholdNgn != null ? Number(config.autoTopupThresholdNgn) : NaN;
  const amount =
    config.autoTopupAmountNgn != null ? Number(config.autoTopupAmountNgn) : NaN;
  const cooldownMinutes = Math.max(1, Number(config.autoTopupCooldownMinutes) || 30);

  if (!Number.isFinite(threshold) || !Number.isFinite(amount) || amount <= 0) {
    return { skipped: true, reason: 'invalid_settings' };
  }
  if (!config.topupBankCode || !config.topupAccountNumber) {
    return { skipped: true, reason: 'missing_bank' };
  }

  let balanceNgn: number;
  try {
    const bal = await strowalletBalanceService.queryBalance(undefined, 'NGN');
    balanceNgn = Number(bal?.balance);
    if (!Number.isFinite(balanceNgn)) {
      return { skipped: true, reason: 'balance_unavailable' };
    }
  } catch (e: any) {
    console.error('[StroWallet auto top-up] balance fetch failed:', e?.message || e);
    return { skipped: true, reason: 'balance_error' };
  }

  if (balanceNgn > threshold) {
    return { skipped: true, reason: 'above_threshold' };
  }

  const cooldownSince = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  const recent = await merchantTopupLogModel.findFirst({
    where: {
      merchant: 'strowallet',
      trigger: 'auto',
      status: { in: ['pending', 'completed'] },
      createdAt: { gte: cooldownSince },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    return { skipped: true, reason: 'cooldown' };
  }

  try {
    const palmpayBalance = await palmpayMerchantService.queryMerchantBalance();
    const available = Number(palmpayBalance?.availableBalanceNgn);
    if (!Number.isFinite(available) || available < amount) {
      console.warn(
        `[StroWallet auto top-up] PalmPay available ₦${available} < needed ₦${amount}`
      );
      return { skipped: true, reason: 'palmpay_insufficient' };
    }
  } catch (e: any) {
    console.error('[StroWallet auto top-up] PalmPay balance failed:', e?.message || e);
    return { skipped: true, reason: 'palmpay_balance_error' };
  }

  try {
    const log = await topUpStroWalletViaPalmpay({
      amount,
      trigger: 'auto',
      adminUserId: null,
      balanceBeforeNgn: balanceNgn,
    });
    console.log(
      `[StroWallet auto top-up] Initiated ₦${amount} (balance was ₦${balanceNgn}, threshold ₦${threshold}) log=${log.id}`
    );
    return { skipped: false, logId: log.id };
  } catch (e: any) {
    console.error('[StroWallet auto top-up] payout failed:', e?.message || e);
    return { skipped: true, reason: 'payout_failed' };
  }
}

export async function listPalmpayBanksForAdmin() {
  return palmpayBanks.queryBankList(0);
}

export async function verifyPalmpayBankAccountForAdmin(bankCode: string, accountNumber: string) {
  if (!bankCode || !accountNumber) {
    throw ApiError.badRequest('bankCode and accountNumber are required');
  }
  if (bankCode === '100033') {
    const result = await palmpayBanks.queryAccount(accountNumber);
    return {
      accountName: result.accountName,
      isValid: result.accountStatus === 0,
    };
  }
  const result = await palmpayBanks.queryBankAccount(bankCode, accountNumber);
  return {
    accountName: result.accountName,
    isValid: result.status === 'Success',
    errorMessage: result.errorMessage,
  };
}
