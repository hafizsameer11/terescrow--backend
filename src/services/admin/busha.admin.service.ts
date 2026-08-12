import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { bushaConfig } from '../busha/busha.config';
import { bushaClient } from '../busha/busha.client';
import { resolvePalmpayBankCode } from '../busha/busha.bank.mapper';
import { palmpayConfig } from '../palmpay/palmpay.config';
import { palmpayPayout } from '../palmpay/palmpay.payout.service';
import { palmpayMerchantService } from '../palmpay/palmpay.merchant.service';

const bushaConfigModel = (prisma as any).bushaConfig;
const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;

export const BUSHA_FIAT_CURRENCIES = ['NGN'] as const;
export const BUSHA_CRYPTO_CURRENCIES = ['BTC', 'ETH', 'USDT', 'USDC'] as const;

const CRYPTO_NETWORK: Record<string, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  USDT: 'TRX',
  USDC: 'ETH',
};

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
          isActive: settings.isActive,
        }
      : null,
    stats: { customerCount, tradeCount },
    recentTrades,
    currencies: {
      fiat: [...BUSHA_FIAT_CURRENCIES],
      crypto: [...BUSHA_CRYPTO_CURRENCIES],
      networks: CRYPTO_NETWORK,
    },
  };
}

export type BushaSettingsInput = {
  payoutBankCode?: string | null;
  payoutBankName?: string | null;
  payoutAccountNumber?: string | null;
  payoutAccountName?: string | null;
  payoutRecipientId?: string | null;
  isActive?: boolean;
};

export async function upsertBushaSettings(input: BushaSettingsInput) {
  return bushaConfigModel.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      payoutBankCode: input.payoutBankCode?.trim() || null,
      payoutBankName: input.payoutBankName?.trim() || null,
      payoutAccountNumber: input.payoutAccountNumber?.trim() || null,
      payoutAccountName: input.payoutAccountName?.trim() || null,
      payoutRecipientId: input.payoutRecipientId?.trim() || null,
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
    isActive: settings?.isActive ?? true,
  });

  return { recipient, settings: saved };
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
};

function stripBase64DataUrl(value: string): string {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma !== -1) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

function buildIdentifyingInformation(input: BushaCustomerKycInput) {
  const country = 'NG';
  const selfie = stripBase64DataUrl(input.selfieBase64);
  const docImage = input.documentImageBase64 ? stripBase64DataUrl(input.documentImageBase64) : undefined;
  const docs: Array<{
    type: string;
    number?: string;
    country?: string;
    image_front?: string;
  }> = [
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
  const address = (providerData.address as Record<string, string>) || {
    city: 'Lagos',
    state: 'Lagos',
    country_id: customer.countryId || 'NG',
    address_line_1: '10 Allen Avenue',
    postal_code: '100001',
  };

  const updated = await bushaClient.updateCustomer(customer.bushaProfileId, {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    country_id: customer.countryId || 'NG',
    birth_date: kyc.birthDate || (providerData.birth_date as string) || '15-06-1990',
    address,
    identifying_information: buildIdentifyingInformation(kyc),
  });

  return bushaCustomerModel.update({
    where: { id: customerId },
    data: {
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
      const network = CRYPTO_NETWORK[sourceCurrency];
      if (!network) throw ApiError.badRequest(`No default network for ${sourceCurrency}`);
      quoteInput.pay_in = { type: 'address', network };
    } else {
      quoteInput.pay_in = { type: 'balance' };
    }

    const settings = await getBushaConfigRow();
    if (settings?.payoutRecipientId) {
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

export async function executeBushaSell(params: {
  adminUserId: number;
  customerId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  fundingMethod?: 'balance' | 'address';
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
    const network = CRYPTO_NETWORK[sourceCurrency];
    if (!network) throw ApiError.badRequest(`No default network for ${sourceCurrency}`);
    quoteInput.pay_in = { type: 'address', network };
  } else {
    quoteInput.pay_in = { type: 'balance' };
  }

  if (settings?.payoutRecipientId && targetCurrency === 'NGN') {
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
      cryptoDepositNetwork: isAddressFunding ? transfer.pay_in?.network || CRYPTO_NETWORK[sourceCurrency] || null : null,
      payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
      status,
      initiatedById: params.adminUserId,
      providerResponse: { quote, transfer, payoutRecipientId: settings?.payoutRecipientId || null } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function listBushaTrades(limit = 50) {
  return bushaTradeLogModel.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
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
  } else if (trade.side === 'buy' && trade.palmpayOrderId) {
    status = 'awaiting_busha';
  } else if (trade.side === 'sell' && trade.cryptoDepositAddress) {
    status = 'awaiting_crypto_deposit';
  }

  return bushaTradeLogModel.update({
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
}
