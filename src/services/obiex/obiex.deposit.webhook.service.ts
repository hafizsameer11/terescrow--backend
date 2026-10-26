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
 * Fake / wrong-network tokens are Obiex's job: they only emit CONFIRMED for real credits.
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

export async function handleObiexDepositWebhook(event: any) {
  if (String(event?.type || '').toUpperCase() !== 'DEPOSIT') {
    return { handled: false, reason: 'not_deposit' };
  }
  if (String(event?.status || '').toUpperCase() !== 'CONFIRMED') {
    return { handled: false, reason: 'not_confirmed' };
  }

  const txId = event?.transactionId ? String(event.transactionId) : null;
  const reference = event?.reference ? String(event.reference) : null;
  if (txId) {
    const dup = await tradeModel().findFirst({
      where: { obiexTransactionId: txId, side: 'receive' },
    });
    if (dup) return { handled: true, reason: 'duplicate', tradeId: dup.id };
  }

  // Re-verify with Obiex API before any ledger credit.
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

  // Prefer exact network match (same EVM address can exist for BSC/ETH/MATIC/AVAXC).
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

  // Strict only when we found a row for that network earlier and it still disagrees
  // (should not happen after the preferred lookup above).
  if (
    verified.network &&
    cached.network &&
    String(verified.network).toUpperCase() !== String(cached.network).toUpperCase()
  ) {
    // Shared EVM address across networks — accept if user owns this address for the live network.
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

  const userLedgerBefore = await getObiexAvailable(cached.userId, currency);
  await creditObiexAsset(cached.userId, currency, amount);
  const userLedgerAfter = await getObiexAvailable(cached.userId, currency);

  const trade = await tradeModel().create({
    data: {
      userId: cached.userId,
      side: 'receive',
      sourceCurrency: currency,
      targetCurrency: currency,
      sourceAmount: formatAmountStr(amount, 8),
      targetAmount: formatAmountStr(amount, 8),
      obiexReference: reference,
      obiexTransactionId: txId,
      obiexStatus: 'CONFIRMED',
      cryptoDepositAddress: address,
      cryptoDepositNetwork: verified.network || cached.network,
      status: 'completed',
      completedAt: new Date(),
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
