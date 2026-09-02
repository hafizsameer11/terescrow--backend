import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;

const FIAT_CODES = new Set(['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS']);

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function parseCreatedAt(raw: unknown): Date {
  if (!raw) return new Date();
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Persist an unmatched Busha `deposit.success` (static address / external wallet)
 * into busha_trade_logs so app history shows RECEIVE.
 *
 * Idempotent on deposit `id` and `reference` via bushaTransferId lookup.
 * Does NOT credit Terescrow fiat — Busha already credited the customer balance.
 */
export async function recordBushaExternalDepositFromWebhook(
  event: string,
  data: any,
  rawBody: any
): Promise<{ created: boolean; tradeId?: string; reason?: string }> {
  const depositId = pickStr(data?.id);
  const reference = pickStr(data?.reference);
  if (!depositId && !reference) {
    return { created: false, reason: 'missing_deposit_id' };
  }

  const statusUpper = String(data?.status || '').toUpperCase();
  const isSuccess =
    event === 'deposit.success' ||
    statusUpper === 'COMPLETED' ||
    statusUpper === 'SUCCESS' ||
    statusUpper === 'FUNDS_RECEIVED';
  if (!isSuccess) {
    return { created: false, reason: 'not_success' };
  }

  // Idempotency: reuse bushaTransferId column for deposit UUID / DPST reference
  const existing = await bushaTradeLogModel.findFirst({
    where: {
      OR: [
        ...(depositId ? [{ bushaTransferId: depositId }] : []),
        ...(reference ? [{ bushaTransferId: reference }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return { created: false, tradeId: existing.id, reason: 'already_recorded' };
  }

  const profileId = pickStr(data?.profile_id, data?.customer_id, data?.user_id);
  if (!profileId) {
    return { created: false, reason: 'missing_profile_id' };
  }

  const customer = await bushaCustomerModel.findFirst({
    where: { bushaProfileId: profileId },
  });
  if (!customer) {
    console.warn(`[Busha deposit] no local customer for profile ${profileId}`);
    return { created: false, reason: 'customer_not_found' };
  }

  const currency = pickStr(data?.currency, data?.source_currency, data?.asset)?.toUpperCase();
  if (!currency) {
    return { created: false, reason: 'missing_currency' };
  }

  const amount = pickStr(data?.amount, data?.total, data?.source_amount, data?.amount_added);
  if (!amount) {
    return { created: false, reason: 'missing_amount' };
  }

  const metaSource = data?.meta?.source || data?.source || {};
  const network = pickStr(
    data?.network,
    data?.network_currency,
    metaSource?.network_currency,
    metaSource?.network_name,
    data?.channel !== 'bank_transfer' ? data?.channel : null
  )?.toUpperCase();

  const address = pickStr(
    data?.address,
    data?.deposit_address,
    data?.account_number,
    metaSource?.address,
    metaSource?.to_address
  );

  const txHash = pickStr(
    data?.hash,
    data?.tx_hash,
    data?.transaction_hash,
    data?.blockchain_hash,
    metaSource?.hash,
    metaSource?.blockchain_url
  );

  let initiatedById: number | null = customer.userId || null;
  if (!initiatedById) {
    const prior = await bushaTradeLogModel.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      select: { initiatedById: true, userId: true },
    });
    initiatedById = prior?.userId || prior?.initiatedById || null;
  }
  if (!initiatedById) {
    console.warn(
      `[Busha deposit] cannot record ${depositId || reference}: no initiatedById for customer ${customer.id}`
    );
    return { created: false, reason: 'missing_initiated_by' };
  }

  const createdAt = parseCreatedAt(data?.created_at);
  const isFiat = FIAT_CODES.has(currency);

  const trade = await bushaTradeLogModel.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      userId: customer.userId || null,
      side: 'cryptoRecv',
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount: amount,
      targetAmount: amount,
      bushaTransferId: depositId || reference,
      bushaStatus: 'funds_received',
      cryptoDepositAddress: address,
      cryptoDepositNetwork: network ? network.slice(0, 20) : null,
      status: 'completed',
      initiatedById,
      createdAt,
      completedAt: createdAt,
      providerResponse: {
        source: 'deposit.success',
        event,
        deposit: data,
        webhook: rawBody,
        txHash: txHash || null,
        channel: data?.channel || null,
        isFiat,
        reference: reference || null,
      } as any,
    },
  });

  console.log(
    `[Busha deposit] recorded external receive trade=${trade.id} ` +
      `${amount} ${currency} profile=${profileId} deposit=${depositId || reference}`
  );

  return { created: true, tradeId: trade.id };
}
