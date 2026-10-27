import { InAppNotificationType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { sendPushNotification } from '../../utils/pushService';
import { obiexClient } from './obiex.client';
import { creditObiexAsset, getObiexAvailable } from './obiex.ledger.service';
import { formatAmountStr } from './obiex.markup';
import { recordLedgerOnlyRecon } from './obiex.reconcile.service';

const depositModel = () => (prisma as any).obiexDepositAddress;
const tradeModel = () => (prisma as any).obiexTradeLog;

function unwrapData(res: any) {
  return res?.data ?? res;
}

function amountsEqual(a: number, b: number, eps = 1e-8): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}

/**
 * Re-fetch deposit from Obiex and require amount/currency/address/status match.
 * Protects against forged or tampered webhook bodies (signature still required upstream).
 */
async function verifyDepositAgainstObiex(event: any): Promise<{
  ok: boolean;
  reason?: string;
  amount?: number;
  currency?: string;
  address?: string;
  network?: string | null;
  live?: any;
}> {
  const txId = event?.transactionId ? String(event.transactionId) : '';
  if (!txId) return { ok: false, reason: 'missing_transaction_id' };

  let liveRaw: any;
  try {
    liveRaw = await obiexClient.getTransaction(txId);
  } catch (e: any) {
    console.warn('[Obiex deposit] getTransaction failed', e?.message || e);
    return { ok: false, reason: 'obiex_lookup_failed' };
  }

  const live = unwrapData(liveRaw);
  if (!live?.id) return { ok: false, reason: 'obiex_tx_not_found' };

  const category = String(live.category || '').toUpperCase();
  const type = String(live.type || '').toUpperCase();
  if (category && category !== 'DEPOSIT' && type !== 'CREDIT') {
    return { ok: false, reason: 'obiex_not_deposit' };
  }

  const deposit = live.deposit || {};
  const liveStatus = String(deposit.status || live.status || '').toUpperCase();
  if (liveStatus && !['CONFIRMED', 'SUCCESSFUL', 'COMPLETED'].includes(liveStatus)) {
    return { ok: false, reason: `obiex_status_${liveStatus || 'unknown'}` };
  }

  const liveAmount = Number(live.amount ?? deposit.amount);
  const eventAmount = Number(event?.amount);
  if (!Number.isFinite(liveAmount) || liveAmount <= 0) {
    return { ok: false, reason: 'obiex_invalid_amount' };
  }
  if (Number.isFinite(eventAmount) && !amountsEqual(liveAmount, eventAmount)) {
    return { ok: false, reason: 'amount_mismatch' };
  }

  const liveCurrency = String(
    live.wallet?.currency?.code || live.currency || event?.currency || ''
  ).toUpperCase();
  const eventCurrency = String(event?.currency || '').toUpperCase();
  if (!liveCurrency) return { ok: false, reason: 'obiex_missing_currency' };
  if (eventCurrency && liveCurrency !== eventCurrency) {
    return { ok: false, reason: 'currency_mismatch' };
  }

  const liveAddress = String(
    deposit.destinationAddress || deposit.address || event?.address || ''
  ).trim();
  const eventAddress = String(event?.address || '').trim();
  if (!liveAddress) return { ok: false, reason: 'obiex_missing_address' };
  if (eventAddress && liveAddress.toLowerCase() !== eventAddress.toLowerCase()) {
    return { ok: false, reason: 'address_mismatch' };
  }

  const network = deposit.network
    ? String(deposit.network).toUpperCase()
    : event?.network
      ? String(event.network).toUpperCase()
      : null;

  return {
    ok: true,
    amount: liveAmount,
    currency: liveCurrency,
    address: liveAddress,
    network,
    live,
  };
}

/**
 * Obiex sends PENDING then CONFIRMED for the same transactionId.
 * Only CONFIRMED credits — once — via unique tx + claim pending→crediting.
 */
export async function handleObiexDepositWebhook(event: any) {
  if (String(event?.type || '').toUpperCase() !== 'DEPOSIT') {
    return { handled: false, reason: 'not_deposit' };
  }

  const providerStatus = String(event?.status || '').toUpperCase();
  const txId = event?.transactionId ? String(event.transactionId) : null;
  const reference = event?.reference ? String(event.reference) : null;

  // Status lifecycle (PENDING → CONFIRMED): ack non-final without crediting.
  if (providerStatus !== 'CONFIRMED') {
    return {
      handled: true,
      reason: 'status_ack',
      providerStatus,
      txId,
    };
  }

  if (txId) {
    const existing = await tradeModel().findFirst({
      where: { obiexTransactionId: txId, side: 'receive' },
    });
    if (existing?.status === 'completed') {
      return { handled: true, reason: 'duplicate', tradeId: existing.id };
    }
    if (existing?.status === 'crediting') {
      // Another worker owns the credit, or crash mid-flight — do not credit again.
      return { handled: true, reason: 'in_progress', tradeId: existing.id };
    }
  }

  const verified = await verifyDepositAgainstObiex(event);
  if (!verified.ok) {
    console.warn('[Obiex deposit] rejected —', verified.reason, {
      txId,
      reference,
      currency: event?.currency,
      amount: event?.amount,
    });
    return { handled: false, reason: verified.reason || 'verify_failed' };
  }

  const address = verified.address!;
  const currency = verified.currency!;
  const amount = verified.amount!;

  let cached = verified.network
    ? await depositModel().findFirst({
        where: {
          address,
          currency,
          network: String(verified.network).toUpperCase(),
        },
      })
    : null;
  if (!cached) {
    cached = await depositModel().findFirst({
      where: { address, currency },
    });
  }
  if (!cached?.userId) {
    return { handled: false, reason: 'unknown_address' };
  }

  if (
    verified.network &&
    cached.network &&
    String(verified.network).toUpperCase() !== String(cached.network).toUpperCase()
  ) {
    const networkOwned = await depositModel().findFirst({
      where: {
        userId: cached.userId,
        address,
        currency,
        network: String(verified.network).toUpperCase(),
      },
    });
    if (networkOwned) {
      cached = networkOwned;
    } else {
      console.warn('[Obiex deposit] network mismatch', {
        txId,
        expected: cached.network,
        got: verified.network,
      });
      return { handled: false, reason: 'network_mismatch' };
    }
  }

  // Insert pending row first (unique on side+txId). Concurrent CONFIRMED → one winner.
  let trade: any;
  try {
    trade = await tradeModel().create({
      data: {
        userId: cached.userId,
        side: 'receive',
        sourceCurrency: currency,
        targetCurrency: currency,
        sourceAmount: formatAmountStr(amount, 8),
        targetAmount: formatAmountStr(amount, 8),
        obiexReference: reference,
        obiexTransactionId: txId,
        obiexStatus: providerStatus,
        cryptoDepositAddress: address,
        cryptoDepositNetwork: verified.network || cached.network,
        status: 'pending',
        initiatedById: cached.userId,
        providerResponse: {
          webhook: event,
          verifiedLive: verified.live,
          verifiedAmount: amount,
          verifiedCurrency: currency,
          verifiedAddress: address,
          verifiedNetwork: verified.network,
        },
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002' && txId) {
      const dup = await tradeModel().findFirst({
        where: { obiexTransactionId: txId, side: 'receive' },
      });
      return {
        handled: true,
        reason: 'duplicate',
        tradeId: dup?.id,
      };
    }
    throw err;
  }

  // Claim before credit — only one concurrent worker proceeds
  const claimed = await tradeModel().updateMany({
    where: { id: trade.id, status: 'pending' },
    data: { status: 'crediting', obiexStatus: providerStatus },
  });
  if (!claimed.count) {
    return { handled: true, reason: 'claim_lost', tradeId: trade.id };
  }

  const userLedgerBefore = await getObiexAvailable(cached.userId, currency);
  await creditObiexAsset(cached.userId, currency, amount);
  const userLedgerAfter = await getObiexAvailable(cached.userId, currency);

  await tradeModel().update({
    where: { id: trade.id },
    data: {
      status: 'completed',
      obiexStatus: 'CONFIRMED',
      completedAt: new Date(),
    },
  });

  try {
    await recordLedgerOnlyRecon({
      tradeLogId: trade.id,
      userId: cached.userId,
      side: 'receive',
      coinCurrency: currency,
      userLedgerBefore,
      userLedgerAfter,
      expectedUserLedgerDelta: amount,
    });
  } catch (e: any) {
    console.warn('[Obiex deposit] recon failed', e?.message || e);
  }

  const amountStr = formatAmountStr(amount, 8);
  const notifBody = `You received ${amountStr} ${currency}. Your balance has been updated.`;
  try {
    await sendPushNotification({
      userId: cached.userId,
      title: 'Crypto Deposit Received',
      body: notifBody,
      sound: 'default',
      priority: 'high',
      data: {
        type: 'crypto_receive',
        provider: 'obiex',
        amount: amountStr,
        currency,
        tradeId: trade.id,
        reference: reference || '',
        network: String(verified.network || cached.network || ''),
      },
    });
    await prisma.inAppNotification.create({
      data: {
        userId: cached.userId,
        title: 'Crypto Deposit Received',
        description: notifBody,
        type: InAppNotificationType.customeer,
      },
    });
  } catch (notifErr: any) {
    console.warn('[Obiex deposit] notification failed', notifErr?.message || notifErr);
  }

  return { handled: true, tradeId: trade.id };
}
