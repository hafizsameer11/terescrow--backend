import { prisma } from '../../utils/prisma';
import { creditObiexAsset, getObiexAvailable } from './obiex.ledger.service';
import { formatAmountStr } from './obiex.markup';
import { recordLedgerOnlyRecon } from './obiex.reconcile.service';

const depositModel = () => (prisma as any).obiexDepositAddress;
const tradeModel = () => (prisma as any).obiexTradeLog;

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

  const address = String(event?.address || '').trim();
  const currency = String(event?.currency || '').toUpperCase();
  const amount = Number(event?.amount);
  if (!address || !currency || !Number.isFinite(amount) || amount <= 0) {
    return { handled: false, reason: 'invalid_payload' };
  }

  const cached = await depositModel().findFirst({
    where: { address, currency },
  });
  if (!cached?.userId) {
    return { handled: false, reason: 'unknown_address' };
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
      cryptoDepositNetwork: cached.network,
      status: 'completed',
      completedAt: new Date(),
      initiatedById: cached.userId,
      providerResponse: event,
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

  return { handled: true, tradeId: trade.id };
}
