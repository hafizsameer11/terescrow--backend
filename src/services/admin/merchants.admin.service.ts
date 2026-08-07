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

/** Admin-editable top-up bank only; API keys are in .env */
export type StroWalletTopupSettingsInput = {
  topupBankCode?: string | null;
  topupBankName?: string | null;
  topupAccountNumber?: string | null;
  topupAccountName?: string | null;
  isActive?: boolean;
};

export async function getStroWalletTopupSettingsRow() {
  return strowalletConfigModel.findUnique({ where: { id: 1 } });
}

export async function upsertStroWalletTopupSettings(input: StroWalletTopupSettingsInput) {
  return strowalletConfigModel.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      topupBankCode: input.topupBankCode?.trim() || null,
      topupBankName: input.topupBankName?.trim() || null,
      topupAccountNumber: input.topupAccountNumber?.trim() || null,
      topupAccountName: input.topupAccountName?.trim() || null,
      isActive: input.isActive ?? true,
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
    take: 10,
    include: {
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

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
      balanceNgn: strowalletBalanceNgn,
      balanceUsd: strowalletBalanceUsd,
      balanceError: strowalletBalanceError,
      recentTopups: recentTopups.map((t: any) => ({
        id: t.id,
        amount: t.amount?.toString?.() ?? String(t.amount),
        currency: t.currency,
        status: t.status,
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
      })),
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
  adminUserId: number;
  amount: number;
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
      initiatedById: params.adminUserId,
    },
    include: {
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  try {
    const payout = await palmpayPayout.initiatePayout({
      orderId,
      title: 'StroWallet top-up',
      description: `Admin top-up to StroWallet (${accountNumber})`,
      payeeName: accountName,
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      currency: 'NGN',
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `StroWallet merchant top-up by admin ${params.adminUserId}`,
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
