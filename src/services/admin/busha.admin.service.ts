import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { bushaConfig } from '../busha/busha.config';
import { bushaClient, type BushaIdentifyingDocument } from '../busha/busha.client';
import { resolvePalmpayBankCode, resolveBushaBankCodeFromPalmpay } from '../busha/busha.bank.mapper';
import { createPalmpayVirtualBankAccount } from '../palmpay/palmpay.virtual.account.service';
import {
  BUSHA_CRYPTO_CURRENCIES,
  BUSHA_FIAT_CURRENCIES,
  getBushaCurrenciesForAdmin,
  resolveBushaNetwork,
} from '../busha/busha.currencies';
import { palmpayConfig } from '../palmpay/palmpay.config';
import { palmpayPayout } from '../palmpay/palmpay.payout.service';
import { palmpayMerchantService } from '../palmpay/palmpay.merchant.service';

const bushaConfigModel = (prisma as any).bushaConfig;
const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;

export { BUSHA_CRYPTO_CURRENCIES, BUSHA_FIAT_CURRENCIES };

function assertBushaConfigured() {
  if (!bushaConfig.isConfigured()) {
    throw ApiError.badRequest('Busha is not configured. Set BUSHA_API_KEY in server .env.');
  }
}

async function getBushaConfigRow() {
  return bushaConfigModel.findUnique({ where: { id: 1 } });
}

export async function getBushaStatusForAdmin() {
  const env = bushaConfig.getConfigForAdmin();
  const settings = await getBushaConfigRow();

  let palmpayBalance = null;
  let palmpayBalanceError: string | null = null;
  try {
    palmpayBalance = await palmpayMerchantService.queryMerchantBalance();
  } catch (e: any) {
    palmpayBalanceError = e?.message || 'Failed to fetch PalmPay balance';
  }

  const [customerCount, tradeCount, recentTrades] = await Promise.all([
    bushaCustomerModel.count(),
    bushaTradeLogModel.count(),
    bushaTradeLogModel.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        customer: { select: { email: true, firstName: true, lastName: true, bushaProfileId: true } },
        initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    }),
  ]);

  return {
    busha: env,
    palmpay: {
      configured: !!(palmpayConfig.getMerchantId() && palmpayConfig.getAppId()),
      balance: palmpayBalance,
      balanceError: palmpayBalanceError,
    },
    settings: settings
      ? {
          payoutBankCode: settings.payoutBankCode,
          payoutBankName: settings.payoutBankName,
          payoutAccountNumber: settings.payoutAccountNumber,
          payoutAccountName: settings.payoutAccountName,
          payoutRecipientId: settings.payoutRecipientId,
          sellPayoutMode: settings.sellPayoutMode || 'palmpay_temp',
          buyMarkupPercent: Number(settings.buyMarkupPercent ?? 0),
          sellMarkupPercent: Number(settings.sellMarkupPercent ?? 0),
          isActive: settings.isActive,
        }
      : null,
    stats: { customerCount, tradeCount },
    recentTrades,
    currencies: getBushaCurrenciesForAdmin(),
  };
}

export type BushaSellPayoutMode = 'palmpay_temp' | 'dashboard_bank';

export type BushaSettingsInput = {
  payoutBankCode?: string | null;
  payoutBankName?: string | null;
  payoutAccountNumber?: string | null;
  payoutAccountName?: string | null;
  payoutRecipientId?: string | null;
  sellPayoutMode?: BushaSellPayoutMode | string | null;
  buyMarkupPercent?: number | string | null;
  sellMarkupPercent?: number | string | null;
  isActive?: boolean;
};

function normalizeMarkupPercent(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 10000) / 10000;
}

export async function upsertBushaSettings(input: BushaSettingsInput) {
  const mode = input.sellPayoutMode?.trim();
  if (mode && mode !== 'palmpay_temp' && mode !== 'dashboard_bank') {
    throw ApiError.badRequest('sellPayoutMode must be palmpay_temp or dashboard_bank');
  }

  const buyMarkup =
    input.buyMarkupPercent !== undefined && input.buyMarkupPercent !== null
      ? normalizeMarkupPercent(input.buyMarkupPercent)
      : undefined;
  const sellMarkup =
    input.sellMarkupPercent !== undefined && input.sellMarkupPercent !== null
      ? normalizeMarkupPercent(input.sellMarkupPercent)
      : undefined;

  return bushaConfigModel.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      payoutBankCode: input.payoutBankCode?.trim() || null,
      payoutBankName: input.payoutBankName?.trim() || null,
      payoutAccountNumber: input.payoutAccountNumber?.trim() || null,
      payoutAccountName: input.payoutAccountName?.trim() || null,
      payoutRecipientId: input.payoutRecipientId?.trim() || null,
      sellPayoutMode: (mode as BushaSellPayoutMode) || 'palmpay_temp',
      buyMarkupPercent: buyMarkup ?? 0,
      sellMarkupPercent: sellMarkup ?? 0,
      isActive: input.isActive ?? true,
    },
    update: {
      ...(input.payoutBankCode !== undefined ? { payoutBankCode: input.payoutBankCode?.trim() || null } : {}),
      ...(input.payoutBankName !== undefined ? { payoutBankName: input.payoutBankName?.trim() || null } : {}),
      ...(input.payoutAccountNumber !== undefined
        ? { payoutAccountNumber: input.payoutAccountNumber?.trim() || null }
        : {}),
      ...(input.payoutAccountName !== undefined
        ? { payoutAccountName: input.payoutAccountName?.trim() || null }
        : {}),
      ...(input.payoutRecipientId !== undefined
        ? { payoutRecipientId: input.payoutRecipientId?.trim() || null }
        : {}),
      ...(mode !== undefined && mode !== null && mode !== ''
        ? { sellPayoutMode: mode }
        : input.sellPayoutMode === null
          ? {}
          : {}),
      ...(buyMarkup !== undefined ? { buyMarkupPercent: buyMarkup } : {}),
      ...(sellMarkup !== undefined ? { sellMarkupPercent: sellMarkup } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function syncBushaPayoutRecipient(profileId: string) {
  assertBushaConfigured();
  const settings = await getBushaConfigRow();
  const bankCode = settings?.payoutBankCode?.trim();
  const accountNumber = settings?.payoutAccountNumber?.trim();
  const accountName = settings?.payoutAccountName?.trim();

  if (!bankCode || !accountNumber || !accountName) {
    throw ApiError.badRequest('Configure payout bank code, account number, and account name first.');
  }

  const recipient = await bushaClient.createRecipient(
    {
      currency: 'NGN',
      country_code: 'NG',
      type: 'ngn_bank',
      bank_name: settings?.payoutBankName?.trim() || bankCode,
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
    },
    profileId
  );

  const saved = await upsertBushaSettings({
    payoutRecipientId: recipient.id,
    payoutBankCode: bankCode,
    payoutBankName: settings?.payoutBankName,
    payoutAccountNumber: accountNumber,
    payoutAccountName: accountName,
    sellPayoutMode: settings?.sellPayoutMode || 'palmpay_temp',
    isActive: settings?.isActive ?? true,
  });

  return { recipient, settings: saved };
}

/**
 * Create dashboard bank as a Busha recipient on a specific profile without overwriting global recipient id.
 * Used for per-user app sells when sellPayoutMode=dashboard_bank.
 */
export async function createDashboardBankRecipientOnProfile(profileId: string) {
  assertBushaConfigured();
  const settings = await getBushaConfigRow();
  const bankCode = settings?.payoutBankCode?.trim();
  const accountNumber = settings?.payoutAccountNumber?.trim();
  const accountName = settings?.payoutAccountName?.trim();

  if (!bankCode || !accountNumber || !accountName) {
    throw ApiError.badRequest('Configure payout bank code, account number, and account name first.');
  }

  const recipient = await bushaClient.createRecipient(
    {
      currency: 'NGN',
      country_code: 'NG',
      type: 'ngn_bank',
      bank_name: settings?.payoutBankName?.trim() || bankCode,
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
    },
    profileId
  );

  return { recipient, settings };
}

export async function listBushaCustomers() {
  return bushaCustomerModel.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      _count: { select: { trades: true } },
    },
  });
}

export async function createBushaCustomer(params: {
  adminUserId: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryId?: string;
  birthDate?: string;
}) {
  assertBushaConfigured();

  const email = params.email.trim().toLowerCase();
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  const phone = params.phone.trim();

  if (!email || !firstName || !lastName || !phone) {
    throw ApiError.badRequest('email, firstName, lastName, and phone are required');
  }

  const created = await bushaClient.createCustomer({
    email,
    first_name: firstName,
    last_name: lastName,
    phone,
    country_id: params.countryId || 'NG',
    birth_date: params.birthDate || '15-06-1990',
  });

  return bushaCustomerModel.create({
    data: {
      id: uuidv4(),
      bushaProfileId: created.id,
      email,
      firstName,
      lastName,
      phone,
      countryId: params.countryId || 'NG',
      status: created.status || 'inactive',
      createdById: params.adminUserId,
      providerData: created as any,
    },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export type BushaCustomerKycInput = {
  documentType: 'national-id' | 'passport' | 'drivers-license';
  documentNumber: string;
  selfieBase64: string;
  documentImageBase64?: string;
  birthDate?: string;
  /** Optional overrides when syncing full Terescrow/Prembly KYC */
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: {
    city: string;
    state: string;
    country_id: string;
    address_line_1: string;
    postal_code: string;
  };
};

function stripBase64DataUrl(value: string): string {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma !== -1) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

function buildIdentifyingInformation(input: BushaCustomerKycInput): BushaIdentifyingDocument[] {
  const country = 'NG';
  const selfie = stripBase64DataUrl(input.selfieBase64);
  const docImage = input.documentImageBase64 ? stripBase64DataUrl(input.documentImageBase64) : undefined;
  const docs: BushaIdentifyingDocument[] = [
    {
      type: input.documentType,
      number: input.documentNumber.trim(),
      country,
      ...(docImage ? { image_front: docImage } : {}),
    },
    {
      type: 'selfie',
      image_front: selfie,
      number: '',
      country,
    },
  ];
  return docs;
}

export async function getBushaCustomer(customerId: string) {
  assertBushaConfigured();
  const customer = await bushaCustomerModel.findUnique({
    where: { id: customerId },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      _count: { select: { trades: true } },
    },
  });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  const remote = await bushaClient.getCustomer(customer.bushaProfileId);
  const updated = await bushaCustomerModel.update({
    where: { id: customerId },
    data: {
      status: remote.status || customer.status,
      providerData: remote as any,
    },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      _count: { select: { trades: true } },
    },
  });

  return {
    ...updated,
    bushaRemote: remote,
  };
}

export async function submitBushaCustomerKyc(customerId: string, kyc: BushaCustomerKycInput) {
  assertBushaConfigured();
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  if (!kyc.documentNumber?.trim() || !kyc.selfieBase64?.trim()) {
    throw ApiError.badRequest('documentNumber and selfieBase64 are required');
  }

  if (
    (kyc.documentType === 'passport' || kyc.documentType === 'drivers-license') &&
    !kyc.documentImageBase64?.trim()
  ) {
    throw ApiError.badRequest('documentImageBase64 is required for passport and drivers-license');
  }

  const providerData = (customer.providerData as Record<string, unknown>) || {};
  const providerAddress = providerData.address as
    | {
        city?: string;
        state?: string;
        country_id?: string;
        address_line_1?: string;
        postal_code?: string;
      }
    | undefined;
  const address = kyc.address || {
    city: providerAddress?.city || 'Lagos',
    state: providerAddress?.state || 'Lagos',
    country_id: providerAddress?.country_id || customer.countryId || 'NG',
    address_line_1: providerAddress?.address_line_1 || '10 Allen Avenue',
    postal_code: providerAddress?.postal_code || '100001',
  };

  const firstName = (kyc.firstName || customer.firstName).trim();
  const lastName = (kyc.lastName || customer.lastName).trim();
  const phone = (kyc.phone || customer.phone).trim();

  const updated = await bushaClient.updateCustomer(customer.bushaProfileId, {
    email: customer.email,
    first_name: firstName,
    last_name: lastName,
    phone,
    country_id: customer.countryId || 'NG',
    birth_date: kyc.birthDate || (providerData.birth_date as string) || '15-06-1990',
    address,
    identifying_information: buildIdentifyingInformation(kyc),
  });

  return bushaCustomerModel.update({
    where: { id: customerId },
    data: {
      firstName,
      lastName,
      phone,
      birthDate: kyc.birthDate || customer.birthDate,
      nin: kyc.documentType === 'national-id' ? kyc.documentNumber : customer.nin,
      status: updated.status || customer.status,
      providerData: updated as any,
    },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function verifyBushaCustomer(customerId: string, kyc?: BushaCustomerKycInput) {
  assertBushaConfigured();
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  if (kyc) {
    await submitBushaCustomerKyc(customerId, kyc);
  }

  await bushaClient.verifyCustomer(customer.bushaProfileId);
  const remote = await bushaClient.getCustomer(customer.bushaProfileId);

  return bushaCustomerModel.update({
    where: { id: customerId },
    data: {
      status: remote.status || customer.status,
      providerData: remote as any,
    },
    include: {
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function refreshBushaCustomer(customerId: string) {
  assertBushaConfigured();
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  const remote = await bushaClient.getCustomer(customer.bushaProfileId);
  return bushaCustomerModel.update({
    where: { id: customerId },
    data: {
      status: remote.status || customer.status,
      providerData: remote as any,
    },
  });
}

export async function previewBushaQuote(params: {
  customerId: string;
  side: 'buy' | 'sell';
  sourceCurrency: string;
  targetCurrency: string;
  amount: string;
  amountField?: 'source' | 'target';
  fundingMethod?: 'temporary_bank_account' | 'balance' | 'address';
  network?: string;
  /** Force NGN/crypto proceeds to stay on Busha balance (ignores dashboard payout bank). */
  payoutToBalance?: boolean;
  /** Use a specific Busha recipient for sell pay_out (e.g. PalmPay temp account). */
  payoutRecipientId?: string;
}) {
  assertBushaConfigured();
  const customer = await bushaCustomerModel.findUnique({ where: { id: params.customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  const sourceCurrency = params.sourceCurrency.toUpperCase();
  const targetCurrency = params.targetCurrency.toUpperCase();
  const amount = String(params.amount).trim();

  const quoteInput: Record<string, unknown> = {
    source_currency: sourceCurrency,
    target_currency: targetCurrency,
  };

  if (params.amountField === 'target') {
    quoteInput.target_amount = amount;
  } else {
    quoteInput.source_amount = amount;
  }

  if (params.side === 'buy') {
    quoteInput.pay_in = { type: params.fundingMethod || 'temporary_bank_account' };
    quoteInput.pay_out = { type: 'balance' };
  } else {
    const funding = params.fundingMethod || 'balance';
    if (funding === 'address') {
      let network: string;
      try {
        network = resolveBushaNetwork(sourceCurrency, params.network);
      } catch (error: any) {
        throw ApiError.badRequest(error?.message || `No network for ${sourceCurrency}`);
      }
      quoteInput.pay_in = { type: 'address', network };
    } else {
      quoteInput.pay_in = { type: 'balance' };
    }

    const settings = await getBushaConfigRow();
    if (params.payoutToBalance) {
      quoteInput.pay_out = { type: 'balance' };
    } else if (params.payoutRecipientId?.trim()) {
      quoteInput.pay_out = {
        type: 'bank_transfer',
        recipient_id: params.payoutRecipientId.trim(),
      };
    } else if (settings?.payoutRecipientId) {
      quoteInput.pay_out = {
        type: 'bank_transfer',
        recipient_id: settings.payoutRecipientId,
      };
    } else {
      quoteInput.pay_out = { type: 'balance' };
    }
  }

  const quote = await bushaClient.createQuote(quoteInput as any, customer.bushaProfileId);
  return { quote, customer };
}

async function getCustomerOrThrow(customerId: string) {
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');
  return customer;
}

export async function executeBushaBuy(params: {
  adminUserId: number;
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  autoPalmpayPayout?: boolean;
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);
  const sourceCurrency = params.sourceCurrency.toUpperCase();
  const targetCurrency = params.targetCurrency.toUpperCase();
  const sourceAmount = String(params.sourceAmount).trim();
  const autoPalmpay = params.autoPalmpayPayout !== false;

  const amountNgn = parseFloat(sourceAmount);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const quote = await bushaClient.createQuote(
    {
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      source_amount: sourceAmount,
      pay_in: { type: 'temporary_bank_account' },
      pay_out: { type: 'balance' },
    },
    customer.bushaProfileId
  );

  const transfer = await bushaClient.createTransfer(quote.id, customer.bushaProfileId);
  const recipient = transfer.pay_in?.recipient_details;

  const trade = await bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      side: 'buy',
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      targetAmount: quote.target_amount,
      bushaQuoteId: quote.id,
      bushaTransferId: transfer.id,
      bushaStatus: transfer.status,
      payInBankCode: recipient?.bank_code || null,
      payInBankName: recipient?.bank_name || null,
      payInAccountNumber: recipient?.account_number || null,
      payInAccountName: recipient?.account_name || null,
      payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
      status: autoPalmpay ? 'awaiting_palmpay' : 'quoted',
      initiatedById: params.adminUserId,
      providerResponse: { quote, transfer } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  if (!autoPalmpay) {
    return trade;
  }

  if (!recipient?.account_number) {
    await bushaTradeLogModel.update({
      where: { id: trade.id },
      data: { status: 'failed', errorMessage: 'Busha did not return temporary bank account details.' },
    });
    throw ApiError.internal('Busha did not return temporary bank account details.');
  }

  try {
    const bank = await resolvePalmpayBankCode({
      bankCode: recipient.bank_code,
      bankName: recipient.bank_name,
    });

    const orderId = `busha_buy_${uuidv4().replace(/-/g, '')}`.substring(0, 32);
    const amountInCents = Math.round(amountNgn * 100);

    const payout = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Busha crypto buy',
      description: `Busha buy ${targetCurrency} for ${customer.email}`,
      payeeName: recipient.account_name || 'Busha',
      payeeBankCode: bank.bankCode,
      payeeBankAccNo: recipient.account_number,
      currency: 'NGN',
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `Busha ${transfer.id} buy ${targetCurrency}`,
    });

    const palmpayStatus =
      payout.orderStatus === 2 ? 'completed' : payout.orderStatus === 3 ? 'failed' : 'pending';
    const tradeStatus = palmpayStatus === 'failed' ? 'palmpay_failed' : 'awaiting_busha';

    return bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        palmpayOrderId: orderId,
        palmpayOrderNo: payout.orderNo,
        palmpayStatus,
        payInBankCode: bank.bankCode,
        status: tradeStatus,
        providerResponse: { quote, transfer, payout, bankMatch: bank } as any,
        ...(palmpayStatus === 'failed' ? { errorMessage: 'PalmPay payout failed', completedAt: new Date() } : {}),
      },
      include: {
        customer: true,
        initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    });
  } catch (error: any) {
    await bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        status: 'palmpay_failed',
        errorMessage: error?.message || 'PalmPay payout failed',
      },
    });
    throw ApiError.internal(error?.message || 'PalmPay payout failed');
  }
}

export async function prepareBushaSellPalmpayPayout(params: {
  adminUserId: number;
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  fundingMethod?: 'balance' | 'address';
  network?: string;
}) {
  assertBushaConfigured();
  if (!palmpayConfig.getMerchantId() || !palmpayConfig.getAppId()) {
    throw ApiError.badRequest('PalmPay merchant is not configured on the server.');
  }

  const customer = await getCustomerOrThrow(params.customerId);
  const targetCurrency = params.targetCurrency.toUpperCase();
  if (targetCurrency !== 'NGN') {
    throw ApiError.badRequest('PalmPay temp payout is only supported for NGN sells.');
  }

  const estimate = await previewBushaQuote({
    customerId: params.customerId,
    side: 'sell',
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    amount: params.sourceAmount,
    fundingMethod: params.fundingMethod,
    network: params.network,
    payoutToBalance: true,
  });

  const targetNgn = parseFloat(String(estimate.quote.target_amount || '0'));
  if (!Number.isFinite(targetNgn) || targetNgn < 100) {
    throw ApiError.badRequest(
      `Estimated NGN payout (${estimate.quote.target_amount}) is below PalmPay minimum of 100 NGN.`
    );
  }

  const palmpay = await createPalmpayVirtualBankAccount({
    amountNgn: Math.ceil(targetNgn),
    title: 'Busha sell payout',
    description: `Sell ${params.sourceAmount} ${params.sourceCurrency.toUpperCase()} payout`,
    remark: `Busha sell ${customer.bushaProfileId} admin ${params.adminUserId}`,
    userId: params.adminUserId,
    orderIdPrefix: 'busha_sell_',
  }).catch((error: any) => {
    throw ApiError.badRequest(error?.message || 'Failed to create PalmPay virtual account');
  });

  const bank = await resolveBushaBankCodeFromPalmpay({
    bankName: palmpay.bankName,
    bankCode: palmpay.payerAccountId,
  }).catch((error: any) => {
    throw ApiError.badRequest(error?.message || 'Failed to map PalmPay bank to Busha');
  });

  const recipient = await bushaClient.createRecipient(
    {
      currency: 'NGN',
      country_code: 'NG',
      type: 'ngn_bank',
      bank_name: bank.bankName,
      bank_code: bank.bankCode,
      account_number: palmpay.accountNumber,
      account_name: palmpay.accountName,
    },
    customer.bushaProfileId
  );

  const payoutQuote = await previewBushaQuote({
    customerId: params.customerId,
    side: 'sell',
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    amount: params.sourceAmount,
    fundingMethod: params.fundingMethod,
    network: params.network,
    payoutRecipientId: recipient.id,
  });

  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    estimateQuote: estimate.quote,
    payoutQuote: payoutQuote.quote,
    palmpay: {
      merchantOrderId: palmpay.merchantOrderId,
      orderNo: palmpay.orderNo,
      orderStatus: palmpay.orderStatus,
      amountNgn: palmpay.amountNgn,
      virtualAccount: {
        bankName: palmpay.bankName,
        accountName: palmpay.accountName,
        accountNumber: palmpay.accountNumber,
      },
      bankMapping: bank,
    },
    bushaRecipient: recipient,
  };
}

export async function executeBushaSell(params: {
  adminUserId: number;
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  fundingMethod?: 'balance' | 'address';
  network?: string;
  /** Override dashboard payout recipient — e.g. PalmPay temp account mapped in Busha. */
  payoutRecipientId?: string;
  palmpayPayoutOrderId?: string;
  palmpayPayoutOrderNo?: string;
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);
  const sourceCurrency = params.sourceCurrency.toUpperCase();
  const targetCurrency = params.targetCurrency.toUpperCase();
  const sourceAmount = String(params.sourceAmount).trim();
  const fundingMethod = params.fundingMethod || 'balance';

  const settings = await getBushaConfigRow();
  const quoteInput: Record<string, unknown> = {
    source_currency: sourceCurrency,
    target_currency: targetCurrency,
    source_amount: sourceAmount,
  };

  if (fundingMethod === 'address') {
    let network: string;
    try {
      network = resolveBushaNetwork(sourceCurrency, params.network);
    } catch (error: any) {
      throw ApiError.badRequest(error?.message || `No network for ${sourceCurrency}`);
    }
    quoteInput.pay_in = { type: 'address', network };
  } else {
    quoteInput.pay_in = { type: 'balance' };
  }

  if (params.payoutRecipientId?.trim()) {
    quoteInput.pay_out = {
      type: 'bank_transfer',
      recipient_id: params.payoutRecipientId.trim(),
    };
  } else if (settings?.payoutRecipientId && targetCurrency === 'NGN') {
    quoteInput.pay_out = {
      type: 'bank_transfer',
      recipient_id: settings.payoutRecipientId,
    };
  } else {
    quoteInput.pay_out = { type: 'balance' };
  }

  const quote = await bushaClient.createQuote(quoteInput as any, customer.bushaProfileId);
  const transfer = await bushaClient.createTransfer(quote.id, customer.bushaProfileId);

  const isAddressFunding = fundingMethod === 'address';
  const status = isAddressFunding ? 'awaiting_crypto_deposit' : 'awaiting_busha';

  return bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      side: 'sell',
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      targetAmount: quote.target_amount,
      bushaQuoteId: quote.id,
      bushaTransferId: transfer.id,
      bushaStatus: transfer.status,
      cryptoDepositAddress: isAddressFunding ? transfer.pay_in?.address || null : null,
      cryptoDepositNetwork: isAddressFunding
        ? transfer.pay_in?.network ||
          (() => {
            try {
              return resolveBushaNetwork(sourceCurrency);
            } catch {
              return null;
            }
          })()
        : null,
      payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
      status,
      initiatedById: params.adminUserId,
      palmpayOrderId: params.palmpayPayoutOrderId || null,
      palmpayOrderNo: params.palmpayPayoutOrderNo || null,
      providerResponse: {
        quote,
        transfer,
        payoutRecipientId: params.payoutRecipientId || settings?.payoutRecipientId || null,
        payoutMode: params.payoutRecipientId
          ? 'palmpay_temp'
          : settings?.payoutRecipientId
            ? 'dashboard_bank'
            : 'balance',
        palmpayPayout: params.palmpayPayoutOrderId
          ? {
              merchantOrderId: params.palmpayPayoutOrderId,
              orderNo: params.palmpayPayoutOrderNo || null,
            }
          : null,
      } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function executeBushaCryptoReceive(params: {
  adminUserId: number;
  customerId: string;
  currency: string;
  amount: string;
  network?: string; // Optional override (defaults from CRYPTO_NETWORK)
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);

  const currency = params.currency.toUpperCase();
  const sourceAmount = String(params.amount).trim();

  let network: string;
  try {
    network = resolveBushaNetwork(currency, params.network);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || `Unsupported currency/network for ${currency}`);
  }
  const amountNgn = parseFloat(sourceAmount);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }

  // Create a "deposit" style transfer: user sends crypto to a generated address,
  // Busha credits the same crypto into customer's balance.
  const quote = await bushaClient.createQuote(
    {
      source_currency: currency,
      target_currency: currency,
      source_amount: sourceAmount,
      pay_in: { type: 'address', network },
      pay_out: { type: 'balance' },
    } as any,
    customer.bushaProfileId
  );

  const transfer = await bushaClient.createTransfer(quote.id, customer.bushaProfileId);

  const trade = await bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      side: 'cryptoRecv',
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount,
      targetAmount: (quote as any).target_amount ?? null,
      bushaQuoteId: quote.id,
      bushaTransferId: transfer.id,
      bushaStatus: transfer.status,
      cryptoDepositAddress: transfer.pay_in?.address || null,
      cryptoDepositNetwork: transfer.pay_in?.network || network,
      payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
      status: 'awaiting_crypto_deposit',
      initiatedById: params.adminUserId,
      providerResponse: { quote, transfer } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  return trade;
}

export async function executeBushaCryptoSend(params: {
  adminUserId: number;
  customerId: string;
  currency: string;
  amount: string;
  destinationAddress: string;
  destinationNetwork?: string; // Optional override (defaults from CRYPTO_NETWORK)
  memo?: string;
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);

  const currency = params.currency.toUpperCase();
  const sourceAmount = String(params.amount).trim();
  const destinationAddress = params.destinationAddress.trim();

  if (!destinationAddress) throw ApiError.badRequest('destinationAddress is required');

  let destinationNetwork: string;
  try {
    destinationNetwork = resolveBushaNetwork(currency, params.destinationNetwork);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || `Unsupported currency/network for ${currency}`);
  }

  const amountNgn = parseFloat(sourceAmount);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw ApiError.badRequest('amount must be greater than 0');
  }

  // Create a "withdrawal/send" style transfer:
  // - Source is customer's Busha crypto balance
  // - Target is an external crypto address
  const payOut: Record<string, unknown> = {
    type: 'address',
    address: destinationAddress,
    network: destinationNetwork,
  };
  if (params.memo) payOut.memo = params.memo;

  const quote = await bushaClient.createQuote(
    {
      source_currency: currency,
      target_currency: currency,
      source_amount: sourceAmount,
      pay_in: { type: 'balance' },
      pay_out: payOut,
    } as any,
    customer.bushaProfileId
  );

  const transfer = await bushaClient.createTransfer(quote.id, customer.bushaProfileId);

  const trade = await bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      side: 'cryptoSend',
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount,
      targetAmount: (quote as any).target_amount ?? null,
      bushaQuoteId: quote.id,
      bushaTransferId: transfer.id,
      bushaStatus: transfer.status,
      status: 'awaiting_busha',
      initiatedById: params.adminUserId,
      providerResponse: { quote, transfer, payOut } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  return trade;
}

function parseMinAmountFromMessage(message: string | undefined | null): string | null {
  const text = String(message || '');
  if (!text) return null;
  const patterns = [
    /minimum(?:\s+withdrawal)?(?:\s+amount)?(?:\s+is|\s+of|:)?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /below(?:\s+the)?\s+minimum(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /min(?:imum)?(?:\s+send)?[:\s]+([0-9]+(?:\.[0-9]+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Preview a crypto send (withdrawal) without creating a transfer.
 * Returns fee quote, from/to addresses, and min-amount errors from Busha.
 */
export async function previewBushaCryptoSend(params: {
  customerId: string;
  currency: string;
  amount: string;
  destinationAddress?: string;
  destinationNetwork?: string;
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);

  const currency = params.currency.toUpperCase();
  const sourceAmount = String(params.amount).trim();
  const destinationAddress = String(params.destinationAddress || '').trim();

  let destinationNetwork: string;
  try {
    destinationNetwork = resolveBushaNetwork(currency, params.destinationNetwork);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || `Unsupported currency/network for ${currency}`);
  }

  let fromAddress: string | null = null;
  let minWithdraw: string | null = null;
  try {
    const deposit = await getBushaCustomerDepositAddress(customer.id, currency, destinationNetwork);
    fromAddress = deposit.address || null;
    const depositMin =
      (deposit as any).minimumWithdraw ??
      (deposit as any).minimumWithdrawal ??
      (deposit as any).provider?.minimum_withdrawal ??
      (deposit as any).provider?.minimumWithdraw ??
      null;
    if (depositMin != null && String(depositMin).trim() !== '') {
      minWithdraw = String(depositMin).trim();
    }
  } catch {
    fromAddress = null;
  }

  let quote: any = null;
  let quoteError: string | null = null;
  let belowMinimum = false;

  if (destinationAddress) {
    const payOut: Record<string, unknown> = {
      type: 'address',
      address: destinationAddress,
      network: destinationNetwork,
    };
    try {
      quote = await bushaClient.createQuote(
        {
          source_currency: currency,
          target_currency: currency,
          source_amount: sourceAmount,
          pay_in: { type: 'balance' },
          pay_out: payOut,
        } as any,
        customer.bushaProfileId
      );
    } catch (error: any) {
      const message = error?.message || 'Failed to quote this send';
      quoteError = message;
      const parsedMin = parseMinAmountFromMessage(message);
      if (parsedMin) {
        minWithdraw = parsedMin;
        belowMinimum = true;
      } else if (/minimum|below min/i.test(message)) {
        belowMinimum = true;
      }
    }
  }

  const fees = Array.isArray(quote?.fees) ? quote.fees : [];
  const firstFee = fees[0];
  const networkFee = firstFee?.amount?.amount != null ? String(firstFee.amount.amount) : null;
  const networkFeeCurrency = firstFee?.amount?.currency
    ? String(firstFee.amount.currency).toUpperCase()
    : currency;

  return {
    currency,
    network: destinationNetwork,
    amount: sourceAmount,
    fromAddress,
    toAddress: destinationAddress || null,
    quote,
    fees,
    networkFee,
    networkFeeCurrency,
    minWithdraw,
    belowMinimum,
    quoteError,
  };
}

/** Crypto → crypto balance convert (Busha swap). */
export async function executeBushaConvert(params: {
  adminUserId: number;
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);

  const sourceCurrency = params.sourceCurrency.toUpperCase();
  const targetCurrency = params.targetCurrency.toUpperCase();
  const sourceAmount = String(params.sourceAmount).trim();

  if (sourceCurrency === targetCurrency) {
    throw ApiError.badRequest('sourceCurrency and targetCurrency must differ for convert');
  }
  if (!BUSHA_CRYPTO_CURRENCIES.includes(sourceCurrency)) {
    throw ApiError.badRequest(`Unsupported source currency: ${sourceCurrency}`);
  }
  if (!BUSHA_CRYPTO_CURRENCIES.includes(targetCurrency)) {
    throw ApiError.badRequest(`Unsupported target currency: ${targetCurrency}`);
  }
  const amountNum = parseFloat(sourceAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const quote = await bushaClient.createQuote(
    {
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      source_amount: sourceAmount,
      pay_in: { type: 'balance' },
      pay_out: { type: 'balance' },
    } as any,
    customer.bushaProfileId
  );

  const transfer = await bushaClient.createTransfer(quote.id, customer.bushaProfileId);
  const statusLower = String(transfer.status || '').toLowerCase();
  const alreadyDone = ['completed', 'funds_converted', 'funds_delivered'].includes(statusLower);

  return bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      side: 'convert',
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      targetAmount: (quote as any).target_amount ?? null,
      bushaQuoteId: quote.id,
      bushaTransferId: transfer.id,
      bushaStatus: transfer.status,
      status: alreadyDone ? 'completed' : 'awaiting_busha',
      initiatedById: params.adminUserId,
      completedAt: alreadyDone ? new Date() : null,
      providerResponse: { quote, transfer } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function previewBushaConvertQuote(params: {
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  amount: string;
  amountField?: 'source' | 'target';
}) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(params.customerId);

  const sourceCurrency = params.sourceCurrency.toUpperCase();
  const targetCurrency = params.targetCurrency.toUpperCase();
  const amount = String(params.amount).trim();

  if (sourceCurrency === targetCurrency) {
    throw ApiError.badRequest('sourceCurrency and targetCurrency must differ for convert');
  }

  const quoteInput: Record<string, unknown> = {
    source_currency: sourceCurrency,
    target_currency: targetCurrency,
    pay_in: { type: 'balance' },
    pay_out: { type: 'balance' },
  };
  if (params.amountField === 'target') {
    quoteInput.target_amount = amount;
  } else {
    quoteInput.source_amount = amount;
  }

  const quote = await bushaClient.createQuote(quoteInput as any, customer.bushaProfileId);
  return { quote, customer };
}

export async function getBushaCustomerWallet(customerId: string, currency?: string) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const balances = await bushaClient.listBalances(
    customer.bushaProfileId,
    currency?.trim().toUpperCase() || undefined
  );
  const crypto = balances.filter((b) => b.type === 'crypto');
  const fiat = balances.filter((b) => b.type === 'fiat');
  const nonZero = balances.filter((b) => {
    const available = parseFloat(b.available?.amount || '0');
    const pending = parseFloat(b.pending?.amount || '0');
    const total = parseFloat(b.total?.amount || '0');
    return available > 0 || pending > 0 || total > 0;
  });

  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      status: customer.status,
    },
    balances,
    summary: {
      total: balances.length,
      cryptoCount: crypto.length,
      fiatCount: fiat.length,
      nonZeroCount: nonZero.length,
    },
  };
}

export async function getBushaCustomerBalance(customerId: string, currency: string) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const code = currency.trim().toUpperCase();
  const balance = await bushaClient.getBalance(code, customer.bushaProfileId);
  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    balance,
  };
}

export async function listBushaCustomerTransfers(
  customerId: string,
  query?: {
    limit?: number;
    quoteId?: string;
    sourceCurrency?: string;
    targetCurrency?: string;
    status?: string;
  }
) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const transfers = await bushaClient.listTransfers(customer.bushaProfileId, {
    ...(query?.limit ? { limit: String(query.limit) } : { limit: '25' }),
    ...(query?.quoteId ? { quote_id: query.quoteId } : {}),
    ...(query?.sourceCurrency ? { source_currency: query.sourceCurrency.toUpperCase() } : {}),
    ...(query?.targetCurrency ? { target_currency: query.targetCurrency.toUpperCase() } : {}),
    ...(query?.status ? { status: query.status } : {}),
  });

  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    transfers,
  };
}

export async function getBushaCustomerTransfer(customerId: string, transferId: string) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const transfer = await bushaClient.getTransfer(transferId, customer.bushaProfileId);
  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    transfer,
  };
}

export async function getBushaCustomerQuote(customerId: string, quoteId: string) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const quote = await bushaClient.getQuote(quoteId, customer.bushaProfileId);
  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    quote,
  };
}

export async function listBushaCustomerRecipients(customerId: string) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const recipients = await bushaClient.listRecipients(customer.bushaProfileId);
  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    recipients,
  };
}

export async function getBushaCustomerDepositAddress(
  customerId: string,
  currency: string,
  network?: string
) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const code = currency.trim().toUpperCase();
  let resolvedNetwork: string | undefined;
  try {
    resolvedNetwork = resolveBushaNetwork(code, network);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || `Unsupported currency/network for ${code}`);
  }

  const raw = await bushaClient.getDepositAddress(code, customer.bushaProfileId, resolvedNetwork);
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // Prefer exact network match when Busha returns multiple
  const match =
    list.find((a) => {
      const n = String(a.network || a.chain || '').toUpperCase();
      return n === resolvedNetwork;
    }) || list[0];

  if (!match?.address) {
    throw ApiError.notFound(
      `No Busha deposit address for ${code} on ${resolvedNetwork}.`
    );
  }

  const minimumRaw =
    (match as any).minimum_deposit ??
    (match as any).minimumDeposit ??
    (match as any).min_deposit ??
    null;
  const minimumDeposit =
    minimumRaw != null && String(minimumRaw).trim() !== ''
      ? String(minimumRaw).trim()
      : null;

  const warnings = (match as any).warnings || null;

  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
    },
    currency: code,
    network: String(match.network || match.chain || resolvedNetwork).toUpperCase(),
    address: String(match.address),
    memo: match.memo || null,
    minimumDeposit,
    warnings: warnings
      ? {
          riskMessage: warnings.risk_message || warnings.riskMessage || null,
          processingTime: warnings.processing_time || warnings.processingTime || null,
        }
      : null,
    reusable: true,
    expiresAt: null as string | null,
    provider: match,
  };
}

export async function regenerateBushaCustomerDepositAddress(
  customerId: string,
  currency: string,
  network?: string
) {
  assertBushaConfigured();
  const customer = await getCustomerOrThrow(customerId);
  const code = currency.trim().toUpperCase();
  let resolvedNetwork: string;
  try {
    resolvedNetwork = resolveBushaNetwork(code, network);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || `Unsupported currency/network for ${code}`);
  }

  const raw = await bushaClient.regenerateDepositAddress(
    { currency: code, network: resolvedNetwork },
    customer.bushaProfileId
  );
  const address = (raw as any)?.address;
  // Busha often returns success with no `data` on regenerate — always re-fetch the live address.
  if (!address) {
    return getBushaCustomerDepositAddress(customerId, code, resolvedNetwork);
  }

  // Prefer re-fetch so we return the post-regeneration address (not a stale payload).
  try {
    return await getBushaCustomerDepositAddress(customerId, code, resolvedNetwork);
  } catch {
    return {
      customer: {
        id: customer.id,
        bushaProfileId: customer.bushaProfileId,
        email: customer.email,
      },
      currency: code,
      network: String((raw as any).network || (raw as any).chain || resolvedNetwork).toUpperCase(),
      address: String(address),
      memo: (raw as any).memo || null,
      reusable: true,
      expiresAt: null as string | null,
      provider: raw,
    };
  }
}

export async function listBushaTrades(limit = 50) {
  return bushaTradeLogModel.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, limit)),
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstname: true,
          lastname: true,
          profilePicture: true,
          country: true,
        },
      },
      customer: { select: { email: true, firstName: true, lastName: true, bushaProfileId: true } },
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function getBushaTrade(tradeId: string) {
  const trade = await bushaTradeLogModel.findUnique({
    where: { id: tradeId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
  if (!trade) throw ApiError.notFound('Trade not found');
  return trade;
}

const COMPLETED_BUSHA_STATUSES = new Set([
  'completed',
  'funds_converted',
  'funds_delivered',
]);

export async function refreshBushaTrade(tradeId: string) {
  assertBushaConfigured();
  const trade = await getBushaTrade(tradeId);
  if (!trade.bushaTransferId) return trade;

  const customer = await getCustomerOrThrow(trade.customerId);
  const remote = await bushaClient.getTransfer(trade.bushaTransferId, customer.bushaProfileId);
  const bushaStatus = remote.status;
  const isComplete = COMPLETED_BUSHA_STATUSES.has(bushaStatus);

  let status = trade.status;
  if (isComplete) {
    status = 'completed';
  } else if (bushaStatus === 'failed' || bushaStatus === 'cancelled') {
    status = 'busha_failed';
  } else if (trade.side === 'cryptoSend') {
    status = 'awaiting_busha';
  } else if (trade.side === 'cryptoRecv' && trade.cryptoDepositAddress) {
    status = 'awaiting_crypto_deposit';
  } else if (trade.side === 'buy' && trade.palmpayOrderId) {
    status = 'awaiting_busha';
  } else if (trade.side === 'sell' && trade.cryptoDepositAddress) {
    status = 'awaiting_crypto_deposit';
  }

  const updated = await bushaTradeLogModel.update({
    where: { id: tradeId },
    data: {
      bushaStatus,
      targetAmount: remote.target_amount || trade.targetAmount,
      status,
      providerResponse: { ...(trade.providerResponse as object), transfer: remote } as any,
      ...(isComplete ? { completedAt: new Date() } : {}),
      ...(status === 'busha_failed' ? { errorMessage: `Busha transfer ${bushaStatus}` } : {}),
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  if (updated.userId) {
    try {
      const { settleBushaTradeIfNeeded } = await import('../busha/busha.settlement.service');
      await settleBushaTradeIfNeeded(tradeId);
      return getBushaTrade(tradeId);
    } catch (e) {
      console.error('[Busha] settle after refresh failed:', (e as any)?.message || e);
    }
  }

  return updated;
}

const BUSHA_WALLET_SUCCESS = new Set([
  'successful',
  'completed',
  'wallet_credited',
  'funds_delivered',
  'funds_converted',
  'funds_received',
]);

function normalizeBushaTradeSide(side: string): 'buy' | 'sell' | 'receive' | 'send' | 'convert' | 'other' {
  const s = String(side || '').toLowerCase();
  if (s === 'buy') return 'buy';
  if (s === 'sell') return 'sell';
  if (s === 'receive' || s === 'cryptorecv') return 'receive';
  if (s === 'send' || s === 'cryptosend') return 'send';
  if (s === 'convert' || s === 'swap') return 'convert';
  return 'other';
}

function parseAmt(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export type BushaCustomerWalletListParams = {
  search?: string;
  status?: string;
  sort?: 'trades-desc' | 'trades-asc' | 'name-az' | 'name-za' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
};

/** Admin User Wallets: Busha customers + trade stats (no live balance fan-out). */
export async function listBushaCustomerWallets(params: BushaCustomerWalletListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const skip = (page - 1) * limit;
  const search = String(params.search || '').trim();
  const status = String(params.status || '').trim().toLowerCase();
  const sort = params.sort || 'newest';

  const where: Record<string, unknown> = {};
  if (status && status !== 'all') {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { bushaProfileId: { contains: search, mode: 'insensitive' } },
      {
        user: {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { firstname: { contains: search, mode: 'insensitive' } },
            { lastname: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  let orderBy: Record<string, string> | Record<string, string>[] = { createdAt: 'desc' };
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'name-az') orderBy = [{ firstName: 'asc' }, { lastName: 'asc' }];
  else if (sort === 'name-za') orderBy = [{ firstName: 'desc' }, { lastName: 'desc' }];
  // trades-desc / trades-asc sorted in memory after counts

  const [total, customers, statusGroups, tradeSideGroups, allTradeCount] = await Promise.all([
    bushaCustomerModel.count({ where }),
    bushaCustomerModel.findMany({
      where,
      orderBy: sort.startsWith('trades') ? { createdAt: 'desc' } : orderBy,
      ...(sort.startsWith('trades') ? {} : { skip, take: limit }),
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
            email: true,
            profilePicture: true,
          },
        },
        _count: { select: { trades: true } },
      },
    }),
    bushaCustomerModel.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    bushaTradeLogModel.groupBy({
      by: ['side'],
      _count: { _all: true },
    }),
    bushaTradeLogModel.count(),
  ]);

  const customerIds = customers.map((c: { id: string }) => c.id);
  const [sideByCustomer, lastTrades, recentCompleted] = await Promise.all([
    customerIds.length
      ? bushaTradeLogModel.groupBy({
          by: ['customerId', 'side'],
          where: { customerId: { in: customerIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    customerIds.length
      ? bushaTradeLogModel.findMany({
          where: { customerId: { in: customerIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['customerId'],
          select: {
            customerId: true,
            id: true,
            side: true,
            status: true,
            sourceCurrency: true,
            targetCurrency: true,
            sourceAmount: true,
            targetAmount: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    customerIds.length
      ? bushaTradeLogModel.findMany({
          where: {
            customerId: { in: customerIds },
            OR: [
              { status: { in: [...BUSHA_WALLET_SUCCESS] } },
              { bushaStatus: { in: [...BUSHA_WALLET_SUCCESS] } },
            ],
          },
          select: {
            customerId: true,
            side: true,
            sourceCurrency: true,
            targetCurrency: true,
            sourceAmount: true,
            targetAmount: true,
            status: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const statsMap = new Map<
    string,
    {
      buy: number;
      sell: number;
      receive: number;
      send: number;
      convert: number;
      other: number;
      total: number;
      completed: number;
      volumeBuyNgn: number;
      volumeSellNgn: number;
    }
  >();

  for (const row of sideByCustomer as Array<{ customerId: string; side: string; _count: { _all: number } }>) {
    const cur = statsMap.get(row.customerId) || {
      buy: 0,
      sell: 0,
      receive: 0,
      send: 0,
      convert: 0,
      other: 0,
      total: 0,
      completed: 0,
      volumeBuyNgn: 0,
      volumeSellNgn: 0,
    };
    const key = normalizeBushaTradeSide(row.side);
    cur[key] += row._count._all;
    cur.total += row._count._all;
    statsMap.set(row.customerId, cur);
  }

  for (const t of recentCompleted as Array<{
    customerId: string;
    side: string;
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmount: string;
    targetAmount: string | null;
  }>) {
    const cur = statsMap.get(t.customerId) || {
      buy: 0,
      sell: 0,
      receive: 0,
      send: 0,
      convert: 0,
      other: 0,
      total: 0,
      completed: 0,
      volumeBuyNgn: 0,
      volumeSellNgn: 0,
    };
    cur.completed += 1;
    const side = normalizeBushaTradeSide(t.side);
    if (side === 'buy' && String(t.sourceCurrency).toUpperCase() === 'NGN') {
      cur.volumeBuyNgn += parseAmt(t.sourceAmount);
    }
    if (side === 'sell' && String(t.targetCurrency).toUpperCase() === 'NGN') {
      cur.volumeSellNgn += parseAmt(t.targetAmount);
    }
    statsMap.set(t.customerId, cur);
  }

  const lastMap = new Map<string, (typeof lastTrades)[0]>();
  for (const t of lastTrades as Array<{ customerId: string }>) {
    if (!lastMap.has(t.customerId)) lastMap.set(t.customerId, t as any);
  }

  let rows = customers.map((c: any) => {
    const stats = statsMap.get(c.id) || {
      buy: 0,
      sell: 0,
      receive: 0,
      send: 0,
      convert: 0,
      other: 0,
      total: c._count?.trades || 0,
      completed: 0,
      volumeBuyNgn: 0,
      volumeSellNgn: 0,
    };
    if (!stats.total && c._count?.trades) stats.total = c._count.trades;
    return {
      id: c.id,
      bushaProfileId: c.bushaProfileId,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      countryId: c.countryId,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      userId: c.userId,
      user: c.user,
      tradeStats: stats,
      lastTrade: lastMap.get(c.id) || null,
    };
  });

  if (sort === 'trades-desc') {
    rows.sort((a: { tradeStats: { total: number } }, b: { tradeStats: { total: number } }) => b.tradeStats.total - a.tradeStats.total);
  } else if (sort === 'trades-asc') {
    rows.sort((a: { tradeStats: { total: number } }, b: { tradeStats: { total: number } }) => a.tradeStats.total - b.tradeStats.total);
  }

  if (sort.startsWith('trades')) {
    rows = rows.slice(skip, skip + limit);
  }

  const statusBreakdown: Record<string, number> = {};
  for (const g of statusGroups as Array<{ status: string; _count: { _all: number } }>) {
    statusBreakdown[g.status || 'unknown'] = g._count._all;
  }

  const sideBreakdown: Record<string, number> = {};
  for (const g of tradeSideGroups as Array<{ side: string; _count: { _all: number } }>) {
    const key = normalizeBushaTradeSide(g.side);
    sideBreakdown[key] = (sideBreakdown[key] || 0) + g._count._all;
  }

  const activeStatuses = new Set(['active', 'verified', 'approved']);
  const activeCustomers = Object.entries(statusBreakdown).reduce(
    (sum, [st, n]) => (activeStatuses.has(st.toLowerCase()) ? sum + n : sum),
    0
  );

  return {
    rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: {
      customers: total,
      activeCustomers,
      trades: allTradeCount,
      statusBreakdown,
      sideBreakdown,
    },
  };
}

/** Detail drawer: profile + live balances + recent trades + stats. */
export async function getBushaCustomerWalletOverview(customerId: string, tradeLimit = 25) {
  const customer = await bushaCustomerModel.findUnique({
    where: { id: customerId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstname: true,
          lastname: true,
          email: true,
          phone: true,
          profilePicture: true,
          country: true,
        },
      },
      createdBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      _count: { select: { trades: true } },
    },
  });
  if (!customer) throw ApiError.notFound('Busha customer not found');

  const trades = await bushaTradeLogModel.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, tradeLimit)),
    include: {
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  const tradeStats = {
    buy: 0,
    sell: 0,
    receive: 0,
    send: 0,
    convert: 0,
    other: 0,
    total: customer._count?.trades || trades.length,
    completed: 0,
    volumeBuyNgn: 0,
    volumeSellNgn: 0,
  };

  const allForStats = await bushaTradeLogModel.findMany({
    where: { customerId },
    select: {
      side: true,
      status: true,
      bushaStatus: true,
      sourceCurrency: true,
      targetCurrency: true,
      sourceAmount: true,
      targetAmount: true,
    },
  });

  for (const t of allForStats) {
    const key = normalizeBushaTradeSide(t.side);
    tradeStats[key] += 1;
    const ok =
      BUSHA_WALLET_SUCCESS.has(String(t.status || '').toLowerCase()) ||
      BUSHA_WALLET_SUCCESS.has(String(t.bushaStatus || '').toLowerCase());
    if (ok) {
      tradeStats.completed += 1;
      if (key === 'buy' && String(t.sourceCurrency).toUpperCase() === 'NGN') {
        tradeStats.volumeBuyNgn += parseAmt(t.sourceAmount);
      }
      if (key === 'sell' && String(t.targetCurrency).toUpperCase() === 'NGN') {
        tradeStats.volumeSellNgn += parseAmt(t.targetAmount);
      }
    }
  }
  tradeStats.total = allForStats.length;

  let wallet: Awaited<ReturnType<typeof getBushaCustomerWallet>> | null = null;
  let walletError: string | null = null;
  try {
    wallet = await getBushaCustomerWallet(customerId);
  } catch (e: any) {
    walletError = e?.message || 'Failed to load live Busha balances';
  }

  let bushaRemote = null;
  try {
    assertBushaConfigured();
    bushaRemote = await bushaClient.getCustomer(customer.bushaProfileId);
    if (bushaRemote?.status && bushaRemote.status !== customer.status) {
      await bushaCustomerModel.update({
        where: { id: customerId },
        data: { status: bushaRemote.status, providerData: bushaRemote as any },
      });
      customer.status = bushaRemote.status;
    }
  } catch {
    /* optional remote refresh */
  }

  return {
    customer: {
      id: customer.id,
      bushaProfileId: customer.bushaProfileId,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      countryId: customer.countryId,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      userId: customer.userId,
      user: customer.user,
      createdBy: customer.createdBy,
    },
    bushaRemote,
    tradeStats,
    trades,
    wallet,
    walletError,
  };
}

