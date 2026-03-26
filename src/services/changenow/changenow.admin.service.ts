import { Decimal } from '@prisma/client/runtime/library';
import {
  ChangeNowSwapOrderStatus,
  ChangeNowSwapSourceType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import * as cn from './changenow.client';
import { resolveTickerForWalletCurrencyId } from './changenow.ticker.service';
import { payinReceivedAssetEvmToChangeNow } from './changenow.payin.received.service';
import { payinMasterWalletEvmToChangeNow } from './changenow.payin.master.service';

let currenciesCache: { at: number; data: cn.ChangeNowCurrency[] } | null = null;
const CURRENCIES_TTL_MS = 60 * 60 * 1000;

export async function getCachedCurrencies(): Promise<cn.ChangeNowCurrency[]> {
  const now = Date.now();
  if (currenciesCache && now - currenciesCache.at < CURRENCIES_TTL_MS) {
    return currenciesCache.data;
  }
  const data = await cn.listCurrencies();
  currenciesCache = { at: now, data };
  return data;
}

function normalizeCurrencyRows(rows: cn.ChangeNowCurrency[]): cn.ChangeNowCurrency[] {
  // Deduplicate by ticker+network so frontend dropdowns stay clean.
  const seen = new Set<string>();
  const out: cn.ChangeNowCurrency[] = [];
  for (const r of rows) {
    const key = `${String(r.ticker || '').toLowerCase()}::${String(r.network || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Returns filtered currencies for frontend:
 * - mainOnly=true (default): featured + tradable (buy/sell) when available
 * - if featured flags are absent, fallback to tradable list
 */
export async function getFrontendCurrencies(mainOnly = true): Promise<cn.ChangeNowCurrency[]> {
  const all = normalizeCurrencyRows(await getCachedCurrencies());
  if (!mainOnly) return all;

  const featured = all.filter((c) => c.featured === true && c.buy !== false && c.sell !== false);
  if (featured.length > 0) return featured;

  const tradable = all.filter((c) => c.buy !== false && c.sell !== false);
  return tradable.length > 0 ? tradable : all;
}

export async function getQuote(input: {
  fromTicker: string;
  toTicker: string;
  amount: string;
}) {
  const norm = cn.normalizeLegacyTickersForV2(input.fromTicker, input.toTicker);
  const fromCurrency = norm.fromCurrency;
  const toCurrency = norm.toCurrency;

  const currencies = await getCachedCurrencies();
  const guessed = cn.resolveNetworksForTickers(fromCurrency, toCurrency, currencies);
  let pairNet = { fromNetwork: guessed.fromNetwork, toNetwork: guessed.toNetwork };
  if (norm.fromNetworkHint) pairNet.fromNetwork = norm.fromNetworkHint;
  if (norm.toNetworkHint) pairNet.toNetwork = norm.toNetworkHint;
  try {
    // Prefer deterministic pair/network discovery when account has access.
    const pairs = await cn.getAvailablePairs({
      fromCurrency: fromCurrency,
      toCurrency: toCurrency,
      flow: 'standard',
    });
    if (pairs.length > 0) {
      pairNet = {
        fromNetwork: pairs[0].fromNetwork || pairNet.fromNetwork,
        toNetwork: pairs[0].toNetwork || pairNet.toNetwork,
      };
    }
  } catch {
    // Some accounts do not have access to available-pairs; fallback to best-effort guess.
  }
  if (norm.fromNetworkHint) pairNet.fromNetwork = norm.fromNetworkHint;
  if (norm.toNetworkHint) pairNet.toNetwork = norm.toNetworkHint;

  const min = await cn.getMinAmount(fromCurrency, toCurrency, 'standard', {
    fromNetwork: pairNet.fromNetwork,
    toNetwork: pairNet.toNetwork,
  });
  const fromNet = min.fromNetwork ?? pairNet.fromNetwork;
  const toNet = min.toNetwork ?? pairNet.toNetwork;
  const est = await cn.getEstimatedAmount({
    fromCurrency: fromCurrency,
    toCurrency: toCurrency,
    fromAmount: input.amount,
    flow: 'standard',
    fromNetwork: fromNet,
    toNetwork: toNet,
  });
  const amt = new Decimal(input.amount);
  if (amt.lt(min.minAmount)) {
    throw ApiError.badRequest(
      `Amount below minimum for this pair: min ${min.minAmount} ${fromCurrency}`
    );
  }
  const estimatedRaw =
    est.estimatedAmount ??
    (typeof (est as any).toAmount === 'number' ? (est as any).toAmount : undefined);
  const estimatedAmount =
    estimatedRaw !== undefined ? new Decimal(String(estimatedRaw)) : null;
  return {
    minAmount: min.minAmount,
    fromTicker: fromCurrency,
    toTicker: toCurrency,
    amountFrom: input.amount,
    fromNetwork: fromNet ?? null,
    toNetwork: toNet ?? null,
    estimatedAmountTo: estimatedAmount?.toString() ?? null,
    rawEstimate: est,
  };
}

export async function getNetworkFeeEstimate(input: {
  fromTicker: string;
  toTicker: string;
  amount: string;
  fromNetwork?: string;
  toNetwork?: string;
  convertedCurrency?: string;
  convertedNetwork?: string;
}) {
  return cn.getNetworkFeeEstimate({
    fromCurrency: input.fromTicker,
    toCurrency: input.toTicker,
    fromAmount: input.amount,
    fromNetwork: input.fromNetwork,
    toNetwork: input.toNetwork,
    convertedCurrency: input.convertedCurrency,
    convertedNetwork: input.convertedNetwork,
  });
}

export async function getAvailablePairs(input: {
  fromCurrency?: string;
  toCurrency?: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: 'standard' | 'fixed-rate';
}) {
  return cn.getAvailablePairs(input);
}

export async function getPartnerExchangesList(input: {
  limit?: number;
  offset?: number;
  sortDirection?: 'ASC' | 'DESC';
  sortField?: 'createdAt' | 'updatedAt';
  dateField?: 'createdAt' | 'updatedAt';
  dateFrom?: string;
  dateTo?: string;
  requestId?: string;
  userId?: string;
  payoutAddress?: string;
  statuses?: string;
}) {
  return cn.listPartnerExchanges(input);
}

function extractCreateId(data: cn.ChangeNowCreateExchangeResponse): string {
  const id =
    data.id ??
    (data as any).exchangeId ??
    (data as any).requestId ??
    (data as any).transactionId;
  if (!id || String(id).trim() === '') {
    throw ApiError.internal('ChangeNOW did not return exchange id');
  }
  return String(id);
}

function extractPayin(data: cn.ChangeNowCreateExchangeResponse): {
  address: string;
  extraId: string | null;
} {
  const address =
    data.payinAddress ?? (data as any).payin_address ?? (data as any).depositAddress;
  if (!address || String(address).trim() === '') {
    throw ApiError.internal('ChangeNOW did not return payin address');
  }
  const extraId =
    data.payinExtraId ?? (data as any).payinExtraId ?? (data as any).extraId ?? null;
  return { address: String(address).trim(), extraId: extraId ? String(extraId) : null };
}

export async function createSwapOrder(input: {
  adminUserId: number;
  sourceType: ChangeNowSwapSourceType;
  receiveTransactionId?: string;
  masterWalletBlockchain?: string;
  walletCurrencyId?: number;
  fromTicker: string;
  toTicker: string;
  amountFrom: string;
  payoutAddressId: number;
  refundAddress?: string;
}) {
  if (!cn.getChangeNowApiKey()) {
    throw ApiError.internal('CHANGENOW_API_KEY is not configured');
  }

  const payout = await prisma.adminExchangePayoutAddress.findFirst({
    where: {
      id: input.payoutAddressId,
      adminUserId: input.adminUserId,
      archived: false,
    },
  });
  if (!payout) {
    throw ApiError.notFound('Payout address not found');
  }

  const amountDec = new Decimal(input.amountFrom);
  if (!amountDec.isFinite() || amountDec.lte(0)) {
    throw ApiError.badRequest('amountFrom must be positive');
  }

  let resolvedFromTicker = input.fromTicker.trim();
  let cryptoTxId: number | null = null;
  let receivedAssetId: number | null = null;
  let masterBc: string | null = null;
  let wcId: number | null = null;

  if (input.sourceType === 'received_asset') {
    const rid = String(input.receiveTransactionId || '').trim();
    if (!rid) {
      throw ApiError.badRequest('receiveTransactionId is required for received_asset');
    }
    const tx = await prisma.cryptoTransaction.findFirst({
      where: { transactionId: rid, transactionType: 'RECEIVE' },
      include: {
        virtualAccount: { include: { walletCurrency: true } },
        cryptoReceive: true,
      },
    });
    if (!tx?.virtualAccount) {
      throw ApiError.notFound('Receive transaction or virtual account not found');
    }
    const wcIdRecv = tx.virtualAccount.currencyId;
    if (!wcIdRecv) {
      throw ApiError.notFound('Receive transaction has no linked wallet currency (currencyId)');
    }
    const t = await resolveTickerForWalletCurrencyId(wcIdRecv);
    if (t.toLowerCase() !== resolvedFromTicker.toLowerCase()) {
      throw ApiError.badRequest(
        `fromTicker mismatch for this deposit: expected ${t} (internal mapping), got ${resolvedFromTicker}`
      );
    }
    resolvedFromTicker = t;
    cryptoTxId = tx.id;
    const recvRow = tx.cryptoReceive;
    if (recvRow?.txHash) {
      const ra2 = await prisma.receivedAsset.findFirst({ where: { txId: recvRow.txHash } });
      receivedAssetId = ra2?.id ?? null;
    }
  } else {
    const bc = String(input.masterWalletBlockchain || '').trim();
    const wcid = input.walletCurrencyId;
    if (!bc || !wcid) {
      throw ApiError.badRequest('masterWalletBlockchain and walletCurrencyId are required for master_wallet');
    }
    const t = await resolveTickerForWalletCurrencyId(wcid);
    if (t.toLowerCase() !== resolvedFromTicker.toLowerCase()) {
      throw ApiError.badRequest(
        `fromTicker mismatch for master asset: expected ${t}, got ${resolvedFromTicker}`
      );
    }
    resolvedFromTicker = t;
    masterBc = bc;
    wcId = wcid;
  }

  if (cryptoTxId) {
    const open = await prisma.changeNowSwapOrder.findFirst({
      where: {
        cryptoTransactionId: cryptoTxId,
        status: { in: ['awaiting_payin', 'payin_broadcast', 'exchanging'] },
      },
    });
    if (open) {
      throw ApiError.conflict('An open ChangeNOW swap already exists for this receive');
    }
  }

  const quote = await getQuote({
    fromTicker: resolvedFromTicker,
    toTicker: input.toTicker.trim(),
    amount: input.amountFrom,
  });
  const expectedTo = quote.estimatedAmountTo ? new Decimal(quote.estimatedAmountTo) : null;

  let fromNet = (quote.fromNetwork ?? '').trim();
  let toNet =
    (quote.toNetwork ?? '').trim() ||
    (payout.toNetworkHint ?? '').trim();
  if (!fromNet || !toNet) {
    const curList = await getCachedCurrencies();
    if (!fromNet) {
      const row = curList.find(
        (c) => c.ticker.toLowerCase() === quote.fromTicker.toLowerCase()
      );
      fromNet = (row?.network ?? '').trim();
    }
    if (!toNet) {
      const row = curList.find(
        (c) => c.ticker.toLowerCase() === quote.toTicker.toLowerCase()
      );
      toNet = (row?.network ?? '').trim();
    }
  }

  const createPayload: Parameters<typeof cn.createExchange>[0] = {
    fromCurrency: quote.fromTicker,
    toCurrency: quote.toTicker,
    fromAmount: input.amountFrom,
    address: payout.address.trim(),
    flow: 'standard',
    type: 'direct',
    fromNetwork: fromNet,
    toNetwork: toNet,
    refundAddress: input.refundAddress?.trim() || '',
  };
  if (payout.extraId?.trim()) {
    createPayload.payoutExtraId = payout.extraId.trim();
  }

  const created = await cn.createExchange(createPayload);
  const changenowId = extractCreateId(created);
  const payin = extractPayin(created);

  const order = await prisma.changeNowSwapOrder.create({
    data: {
      adminUserId: input.adminUserId,
      sourceType: input.sourceType,
      status: 'awaiting_payin',
      receivedAssetId,
      cryptoTransactionId: cryptoTxId,
      masterWalletBlockchain: masterBc,
      payoutAddressId: payout.id,
      changenowId,
      fromTicker: quote.fromTicker,
      toTicker: quote.toTicker,
      flow: 'standard',
      amountFrom: amountDec,
      expectedAmountTo: expectedTo,
      payinAddress: payin.address,
      payinExtraId: payin.extraId,
      payoutAddress: payout.address,
      payoutExtraId: payout.extraId,
      refundAddress: input.refundAddress?.trim() || null,
    },
  });

  try {
    if (input.sourceType === 'received_asset') {
      const pay = await payinReceivedAssetEvmToChangeNow({
        receiveTransactionId: String(input.receiveTransactionId),
        adminUserId: input.adminUserId,
        changeNowSwapOrderDbId: order.id,
        payinAddress: payin.address,
        amountFrom: amountDec,
      });
      await prisma.changeNowSwapOrder.update({
        where: { id: order.id },
        data: {
          status: 'payin_broadcast',
          outboundTxHash: pay.txHash,
          receivedAssetDisbursementId: pay.disbursementId,
        },
      });
    } else {
      const pay = await payinMasterWalletEvmToChangeNow({
        masterWalletBlockchain: masterBc!,
        walletCurrencyId: wcId!,
        payinAddress: payin.address,
        amountFrom: amountDec,
        changeNowSwapOrderDbId: order.id,
      });
      await prisma.changeNowSwapOrder.update({
        where: { id: order.id },
        data: {
          status: 'payin_broadcast',
          outboundTxHash: pay.txHash,
          masterWalletTxId: pay.masterWalletTxId,
        },
      });
    }
  } catch (e: any) {
    await prisma.changeNowSwapOrder.update({
      where: { id: order.id },
      data: {
        status: 'failed',
        errorMessage: (e?.message || String(e)).slice(0, 2000),
      },
    });
    throw e;
  }

  return prisma.changeNowSwapOrder.findUnique({
    where: { id: order.id },
    include: {
      payoutProfile: true,
      receivedAsset: true,
      cryptoTransaction: { include: { cryptoReceive: true } },
    },
  });
}

export function mapRemoteStatusToLocal(
  remote: string | undefined | null
): ChangeNowSwapOrderStatus | null {
  if (!remote) return null;
  const t = remote.toLowerCase();
  if (['finished', 'completed', 'complete', 'success', 'done'].includes(t)) return 'completed';
  if (t.includes('fail') || t === 'expired') return 'failed';
  if (t.includes('refund')) return 'refunded';
  if (
    [
      'confirming',
      'exchanging',
      'sending',
      'new',
      'waiting',
      'pending',
      'verifying',
    ].includes(t)
  )
    return 'exchanging';
  return 'exchanging';
}

export async function refreshSwapOrderStatus(orderId: number, adminUserId: number) {
  const order = await prisma.changeNowSwapOrder.findFirst({
    where: { id: orderId, adminUserId },
  });
  if (!order) {
    throw ApiError.notFound('Swap order not found');
  }
  if (!cn.getChangeNowApiKey()) {
    throw ApiError.internal('CHANGENOW_API_KEY is not configured');
  }

  const remote = await cn.getExchangeById(order.changenowId);
  const st = String(remote.status || '');
  const local = mapRemoteStatusToLocal(st);

  const payinHash =
    remote.payinHash ??
    (remote as any).payInHash ??
    (remote as any).payin?.hash ??
    null;
  const payoutHash =
    remote.payoutHash ??
    (remote as any).payOutHash ??
    (remote as any).payout?.hash ??
    null;
  const amtRecv =
    remote.amountReceive ?? (remote as any).amountTo ?? (remote as any).expectedAmount ?? null;

  const data: Prisma.ChangeNowSwapOrderUpdateInput = {
    changenowStatus: st,
    lastPolledAt: new Date(),
  };
  if (payinHash) data.payinHash = String(payinHash);
  if (payoutHash) data.payoutHash = String(payoutHash);
  if (amtRecv != null && String(amtRecv).trim() !== '') {
    data.amountReceive = new Decimal(String(amtRecv));
  }
  if (local && local !== order.status) {
    data.status = local;
  }

  return prisma.changeNowSwapOrder.update({
    where: { id: order.id },
    data,
    include: {
      payoutProfile: true,
      receivedAsset: true,
      cryptoTransaction: { include: { cryptoReceive: true } },
    },
  });
}

export async function pollOpenSwapOrders(limit = 50) {
  if (!cn.getChangeNowApiKey()) return { processed: 0, skipped: true as const };
  const open = await prisma.changeNowSwapOrder.findMany({
    where: {
      status: { in: ['awaiting_payin', 'payin_broadcast', 'exchanging'] },
    },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  });
  let n = 0;
  for (const o of open) {
    try {
      await refreshSwapOrderStatus(o.id, o.adminUserId);
      n++;
    } catch {
      /* continue */
    }
  }
  return { processed: n };
}

export async function listPayoutAddresses(adminUserId: number) {
  return prisma.adminExchangePayoutAddress.findMany({
    where: { adminUserId, archived: false },
    orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
  });
}

export async function createPayoutAddress(input: {
  adminUserId: number;
  label?: string;
  address: string;
  extraId?: string;
  toNetworkHint?: string;
  isDefault?: boolean;
}) {
  if (input.isDefault) {
    await prisma.adminExchangePayoutAddress.updateMany({
      where: { adminUserId: input.adminUserId },
      data: { isDefault: false },
    });
  }
  return prisma.adminExchangePayoutAddress.create({
    data: {
      adminUserId: input.adminUserId,
      label: input.label?.trim() || null,
      address: input.address.trim(),
      extraId: input.extraId?.trim() || null,
      toNetworkHint: input.toNetworkHint?.trim() || null,
      isDefault: !!input.isDefault,
    },
  });
}

export async function updatePayoutAddress(
  adminUserId: number,
  id: number,
  patch: {
    label?: string;
    address?: string;
    extraId?: string | null;
    toNetworkHint?: string | null;
    isDefault?: boolean;
    archived?: boolean;
  }
) {
  const row = await prisma.adminExchangePayoutAddress.findFirst({
    where: { id, adminUserId },
  });
  if (!row) throw ApiError.notFound('Payout address not found');
  if (patch.isDefault) {
    await prisma.adminExchangePayoutAddress.updateMany({
      where: { adminUserId },
      data: { isDefault: false },
    });
  }
  return prisma.adminExchangePayoutAddress.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
      ...(patch.extraId !== undefined
        ? { extraId: patch.extraId === null ? null : patch.extraId.trim() }
        : {}),
      ...(patch.toNetworkHint !== undefined ? { toNetworkHint: patch.toNetworkHint } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
    },
  });
}

export async function deletePayoutAddress(adminUserId: number, id: number) {
  const row = await prisma.adminExchangePayoutAddress.findFirst({
    where: { id, adminUserId },
  });
  if (!row) throw ApiError.notFound('Payout address not found');
  await prisma.adminExchangePayoutAddress.update({
    where: { id },
    data: { archived: true, isDefault: false },
  });
}

export async function listSwaps(input: {
  adminUserId: number;
  page?: number;
  limit?: number;
  status?: ChangeNowSwapOrderStatus;
}) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const where: Prisma.ChangeNowSwapOrderWhereInput = { adminUserId: input.adminUserId };
  if (input.status) where.status = input.status;
  const [items, total] = await Promise.all([
    prisma.changeNowSwapOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        payoutProfile: true,
        cryptoTransaction: { select: { transactionId: true, currency: true, blockchain: true } },
      },
    }),
    prisma.changeNowSwapOrder.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getSwap(adminUserId: number, id: number) {
  const order = await prisma.changeNowSwapOrder.findFirst({
    where: { id, adminUserId },
    include: {
      payoutProfile: true,
      receivedAsset: true,
      cryptoTransaction: { include: { cryptoReceive: true } },
      masterWalletTransaction: true,
      receivedAssetDisbursement: true,
    },
  });
  if (!order) throw ApiError.notFound('Swap order not found');
  return order;
}
