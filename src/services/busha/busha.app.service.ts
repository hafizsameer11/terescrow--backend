import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  assertBushaAppActive,
  getSellPayoutMode,
  previewBushaQuote,
  prepareBushaSellPalmpayPayout,
  executeBushaSell,
  executeBushaBuy,
  executeBushaCryptoReceive,
  executeBushaCryptoSend,
  getBushaCustomerWallet,
  refreshBushaCustomer,
  submitBushaCustomerKyc,
  verifyBushaCustomer,
  createDashboardBankRecipientOnProfile,
  getBushaTrade,
  refreshBushaTrade,
  getBushaConfigRow,
} from './busha.trade.service';
import { resolveBushaNetwork, getBushaCurrenciesForAdmin } from './busha.currencies';
import { fiatWalletService } from '../fiat/fiat.wallet.service';
import { settleBushaTradeIfNeeded } from './busha.settlement.service';
import { bushaConfig } from './busha.config';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;

export async function getBushaAppPublicStatus() {
  const configured = bushaConfig.isConfigured();
  const settings = await getBushaConfigRow();
  return {
    configured,
    isActive: !!(configured && settings?.isActive),
    sellPayoutMode: (settings?.sellPayoutMode || 'palmpay_temp') as string,
    currencies: getBushaCurrenciesForAdmin(),
  };
}

export async function getBushaAppStatusForUser(userId: number) {
  const base = await getBushaAppPublicStatus();
  if (!base.isActive) {
    return {
      ...base,
      needsKyc: false,
      canTrade: false,
      kycStatus: 'inactive_platform',
      kyc: null,
    };
  }
  const { getBushaKycStatusForUser } = await import('./busha.kyc.service');
  const kyc = await getBushaKycStatusForUser(userId);
  return {
    ...base,
    needsKyc: kyc.needsKyc,
    canTrade: kyc.canTrade,
    kycStatus: kyc.kycStatus,
    needsTerescrowKyc: kyc.needsTerescrowKyc,
    terescrowKycReady: kyc.terescrowKycReady,
    canActivateCrypto: kyc.canActivateCrypto,
    kyc,
  };
}

export async function ensureBushaCustomerForUser(userId: number) {
  await assertBushaAppActive();

  const existing = await bushaCustomerModel.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  throw ApiError.badRequest(
    'Complete Busha crypto KYC first (legal name, date of birth, NIN, and selfie) before using crypto.'
  );
}

export async function getAppBushaProfile(userId: number) {
  await assertBushaAppActive();
  const { getBushaKycStatusForUser } = await import('./busha.kyc.service');
  const kyc = await getBushaKycStatusForUser(userId);

  if (!kyc.customer) {
    return {
      customer: null,
      bushaRemote: null,
      ready: { active: false, deposit: false, payout: false },
      currencies: getBushaCurrenciesForAdmin(),
      kyc,
    };
  }

  const refreshed = await refreshBushaCustomer(kyc.customer.id);
  const remote = refreshed.providerData || {};
  return {
    customer: refreshed,
    bushaRemote: remote,
    ready: {
      active: String(refreshed.status).toLowerCase() === 'active',
      deposit: !!(remote as any).deposit,
      payout: !!(remote as any).payout,
    },
    currencies: getBushaCurrenciesForAdmin(),
    kyc,
  };
}

export async function submitAppBushaKyc(
  userId: number,
  input: {
    documentType: 'national-id' | 'passport' | 'drivers-license';
    documentNumber: string;
    selfieBase64: string;
    documentImageBase64?: string;
    birthDate?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  return submitBushaCustomerKyc(customer.id, input);
}

export async function verifyAppBushaKyc(
  userId: number,
  input?: {
    documentType: 'national-id' | 'passport' | 'drivers-license';
    documentNumber: string;
    selfieBase64: string;
    documentImageBase64?: string;
    birthDate?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  if (input?.documentType && input.documentNumber && input.selfieBase64) {
    await submitBushaCustomerKyc(customer.id, input);
  }
  return verifyBushaCustomer(customer.id, input as any);
}

async function assertCustomerTradeReady(customerId: string, needPayout = false) {
  const customer = await bushaCustomerModel.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Busha customer not found');
  const status = String(customer.status || '').toLowerCase();
  if (status !== 'active' && status !== 'in_review') {
    // still allow in_review for some ops? Plan says gate until active
  }
  if (status !== 'active') {
    throw ApiError.badRequest(
      `Busha profile is "${customer.status}". Complete KYC and wait until status is active before trading.`
    );
  }
  const remote = (customer.providerData || {}) as any;
  if (needPayout && remote.payout === false) {
    throw ApiError.badRequest('Busha payout is not enabled on this profile yet.');
  }
  if (remote.deposit === false && needPayout === false) {
    // deposit flag mainly for receive
  }
  return customer;
}

export async function getAppBushaWallet(userId: number, currency?: string) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  return getBushaCustomerWallet(customer.id, currency);
}

export async function previewAppBushaSell(
  userId: number,
  params: {
    sourceCurrency: string;
    sourceAmount: string;
    fundingMethod?: 'balance' | 'address';
    network?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);
  const sellPayoutMode = await getSellPayoutMode();

  const quote = await previewBushaQuote({
    customerId: customer.id,
    side: 'sell',
    sourceCurrency: params.sourceCurrency,
    targetCurrency: 'NGN',
    amount: params.sourceAmount,
    fundingMethod: params.fundingMethod || 'balance',
    network: params.network,
    payoutToBalance: true,
  });

  return {
    quote: quote.quote,
    customer: quote.customer,
    sellPayoutMode,
    note:
      sellPayoutMode === 'palmpay_temp'
        ? 'NGN settles to PalmPay temp account; your Terescrow NGN wallet is credited when Busha completes.'
        : 'NGN settles to the admin dashboard bank; your Terescrow NGN wallet is credited when Busha completes.',
  };
}

export async function executeAppBushaSell(
  userId: number,
  params: {
    sourceCurrency: string;
    sourceAmount: string;
    fundingMethod?: 'balance' | 'address';
    network?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);
  const sellPayoutMode = await getSellPayoutMode();
  const settings = await getBushaConfigRow();

  let payoutRecipientId: string | undefined;
  let palmpayPayoutOrderId: string | undefined;
  let palmpayPayoutOrderNo: string | undefined;
  let prepareMeta: any = null;

  if (sellPayoutMode === 'palmpay_temp') {
    const prepared = await prepareBushaSellPalmpayPayout({
      adminUserId: userId,
      customerId: customer.id,
      sourceCurrency: params.sourceCurrency,
      targetCurrency: 'NGN',
      sourceAmount: params.sourceAmount,
      fundingMethod: params.fundingMethod || 'balance',
      network: params.network,
    });
    payoutRecipientId = prepared.bushaRecipient.id;
    palmpayPayoutOrderId = prepared.palmpay.merchantOrderId;
    palmpayPayoutOrderNo = prepared.palmpay.orderNo;
    prepareMeta = prepared;
  } else {
    if (!settings?.payoutBankCode || !settings?.payoutAccountNumber || !settings?.payoutAccountName) {
      throw ApiError.badRequest('Admin dashboard payout bank is not configured.');
    }
    // Recipient must exist on this user's Busha profile
    const synced = await createDashboardBankRecipientOnProfile(customer.bushaProfileId);
    payoutRecipientId = synced.recipient.id;
  }

  const trade = await executeBushaSell({
    adminUserId: userId,
    customerId: customer.id,
    sourceCurrency: params.sourceCurrency,
    targetCurrency: 'NGN',
    sourceAmount: params.sourceAmount,
    fundingMethod: params.fundingMethod || 'balance',
    network: params.network,
    payoutRecipientId,
    palmpayPayoutOrderId,
    palmpayPayoutOrderNo,
  });

  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const estimatedNgn = parseFloat(String(trade.targetAmount || '0')) || 0;
  const fiatTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: fiatWallet.id,
      type: 'CRYPTO_SELL',
      status: 'pending',
      currency: 'NGN',
      amount: estimatedNgn,
      fees: 0,
      totalAmount: estimatedNgn,
      description: `Busha sell ${params.sourceAmount} ${params.sourceCurrency.toUpperCase()}`,
      palmpayOrderId: palmpayPayoutOrderId || null,
      palmpayOrderNo: palmpayPayoutOrderNo || null,
    },
  });

  const updated = await bushaTradeLogModel.update({
    where: { id: trade.id },
    data: {
      userId,
      payoutMode: sellPayoutMode,
      fiatTransactionId: fiatTxn.id,
      status: trade.status === 'awaiting_crypto_deposit' ? 'awaiting_crypto_deposit' : 'settling',
      providerResponse: {
        ...(trade.providerResponse as object),
        prepare: prepareMeta,
        sellPayoutMode,
      } as any,
    },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });

  // Try immediate settlement if already complete
  await settleBushaTradeIfNeeded(updated.id);

  return getBushaTrade(updated.id);
}

export async function executeAppBushaBuy(
  userId: number,
  params: {
    sourceAmount: string;
    targetCurrency: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const amountNgn = parseFloat(params.sourceAmount);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw ApiError.badRequest('sourceAmount must be greater than 0');
  }

  const fiatWallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const balance = parseFloat(String(fiatWallet.balance));
  if (balance < amountNgn) {
    throw ApiError.badRequest('Insufficient NGN wallet balance');
  }

  const fiatTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: fiatWallet.id,
      type: 'CRYPTO_BUY',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: `Busha buy ${params.targetCurrency.toUpperCase()}`,
    },
  });

  try {
    await fiatWalletService.debitWallet(fiatWallet.id, amountNgn, fiatTxn.id);
  } catch (error: any) {
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: { status: 'failed' },
    });
    throw ApiError.badRequest(error?.message || 'Failed to debit NGN wallet');
  }

  try {
    const trade = await executeBushaBuy({
      adminUserId: userId,
      customerId: customer.id,
      sourceCurrency: 'NGN',
      targetCurrency: params.targetCurrency,
      sourceAmount: params.sourceAmount,
      autoPalmpayPayout: true,
    });

    const updated = await bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        userId,
        fiatTransactionId: fiatTxn.id,
        status: trade.status === 'palmpay_failed' ? 'palmpay_failed' : 'settling',
        providerResponse: {
          ...(trade.providerResponse as object),
          fiatDebitTransactionId: fiatTxn.id,
        } as any,
      },
      include: {
        customer: true,
        initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
      },
    });

    if (updated.status === 'palmpay_failed') {
      await reverseBuyDebit(userId, fiatTxn.id, amountNgn, 'Busha buy PalmPay failed');
    } else {
      await settleBushaTradeIfNeeded(updated.id);
    }

    return getBushaTrade(updated.id);
  } catch (error: any) {
    await reverseBuyDebit(userId, fiatTxn.id, amountNgn, error?.message || 'Busha buy failed');
    throw error;
  }
}

async function reverseBuyDebit(userId: number, originalTxnId: string, amountNgn: number, reason: string) {
  const wallet = await fiatWalletService.getOrCreateWallet(userId, 'NGN');
  const refundTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId: wallet.id,
      type: 'CRYPTO_BUY_REFUND',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: reason,
    },
  });
  await fiatWalletService.creditWallet(wallet.id, amountNgn, refundTxn.id);
  await prisma.fiatTransaction.update({
    where: { id: originalTxnId },
    data: { status: 'failed', description: reason },
  });
}

export async function executeAppBushaReceive(
  userId: number,
  params: { currency: string; amount: string; network?: string }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, false);

  const trade = await executeBushaCryptoReceive({
    adminUserId: userId,
    customerId: customer.id,
    currency: params.currency,
    amount: params.amount,
    network: params.network,
  });

  return bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { userId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function executeAppBushaSend(
  userId: number,
  params: {
    currency: string;
    amount: string;
    destinationAddress: string;
    destinationNetwork?: string;
    memo?: string;
  }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  await assertCustomerTradeReady(customer.id, true);

  const trade = await executeBushaCryptoSend({
    adminUserId: userId,
    customerId: customer.id,
    currency: params.currency,
    amount: params.amount,
    destinationAddress: params.destinationAddress,
    destinationNetwork: params.destinationNetwork,
    memo: params.memo,
  });

  return bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { userId },
    include: {
      customer: true,
      initiatedBy: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
  });
}

export async function previewAppBushaSend(
  userId: number,
  params: { currency: string; amount: string; destinationNetwork?: string }
) {
  await assertBushaAppActive();
  const customer = await ensureBushaCustomerForUser(userId);
  let network: string | undefined;
  try {
    network = resolveBushaNetwork(params.currency, params.destinationNetwork);
  } catch (error: any) {
    throw ApiError.badRequest(error?.message || 'Unsupported network');
  }
  const wallet = await getBushaCustomerWallet(customer.id, params.currency.toUpperCase());
  const bal = wallet.balances.find((b: any) => b.currency?.toUpperCase() === params.currency.toUpperCase());
  const available = parseFloat(bal?.available?.amount || '0');
  const amount = parseFloat(params.amount);
  return {
    currency: params.currency.toUpperCase(),
    network,
    amount: params.amount,
    available: String(available),
    sufficient: Number.isFinite(amount) && amount > 0 && available >= amount,
  };
}

export async function getAppBushaTrade(userId: number, tradeId: string) {
  await assertBushaAppActive();
  const trade = await getBushaTrade(tradeId);
  if (trade.userId && trade.userId !== userId) {
    throw ApiError.forbidden('Not your trade');
  }
  const customer = await ensureBushaCustomerForUser(userId);
  if (trade.customerId !== customer.id && trade.userId !== userId) {
    throw ApiError.forbidden('Not your trade');
  }
  return trade;
}

export async function refreshAppBushaTrade(userId: number, tradeId: string) {
  const trade = await getAppBushaTrade(userId, tradeId);
  await refreshBushaTrade(trade.id);
  await settleBushaTradeIfNeeded(trade.id);
  return getBushaTrade(trade.id);
}

export async function listAppBushaTrades(userId: number, limit = 30) {
  await assertBushaAppActive();
  return bushaTradeLogModel.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
