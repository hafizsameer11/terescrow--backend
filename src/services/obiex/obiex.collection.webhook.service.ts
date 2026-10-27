import { prisma } from '../../utils/prisma';
import { creditObiexAsset, getObiexAvailable } from './obiex.ledger.service';
import { formatAmountStr } from './obiex.markup';
import { recordLedgerOnlyRecon } from './obiex.reconcile.service';

const tradeModel = () => (prisma as any).obiexTradeLog;

/**
 * COLLECTION (fiat buy VA mode). Same reference may get PENDING/HELD then COMPLETED.
 * Credit crypto only once on COMPLETED via claim awaiting→crediting.
 */
export async function handleObiexCollectionWebhook(event: any) {
  if (String(event?.type || '').toUpperCase() !== 'COLLECTION') {
    return { handled: false, reason: 'not_collection' };
  }

  const reference = event?.reference ? String(event.reference) : null;
  const status = String(event?.status || '').toUpperCase();
  if (!reference) return { handled: false, reason: 'no_reference' };

  const trade = await tradeModel().findFirst({
    where: { obiexReference: reference, side: 'buy' },
  });
  if (!trade) return { handled: false, reason: 'trade_not_found' };

  if (status === 'COMPLETED') {
    if (trade.status === 'completed') {
      return { handled: true, reason: 'already_completed', tradeId: trade.id };
    }

    const claimed = await tradeModel().updateMany({
      where: {
        id: trade.id,
        status: { in: ['awaiting_payment', 'pending', 'processing', 'held'] },
      },
      data: { status: 'crediting', obiexStatus: status },
    });
    if (!claimed.count) {
      const again = await tradeModel().findUnique({ where: { id: trade.id } });
      if (again?.status === 'completed') {
        return { handled: true, reason: 'already_completed', tradeId: trade.id };
      }
      // crediting = another worker in progress or crashed mid-credit — never credit twice
      console.warn('[Obiex collection] claim lost / in progress', {
        tradeId: trade.id,
        status: again?.status,
      });
      return { handled: true, reason: 'claim_lost', tradeId: trade.id };
    }

    const targetCurrency = String(
      event?.targetCurrency || trade.targetCurrency || 'USDT'
    ).toUpperCase();
    const targetAmount = Number(event?.targetAmount);
    if (trade.userId && Number.isFinite(targetAmount) && targetAmount > 0) {
      const before = await getObiexAvailable(trade.userId, targetCurrency);
      await creditObiexAsset(trade.userId, targetCurrency, targetAmount);
      const after = await getObiexAvailable(trade.userId, targetCurrency);
      try {
        await recordLedgerOnlyRecon({
          tradeLogId: trade.id,
          userId: trade.userId,
          side: 'buy',
          coinCurrency: targetCurrency,
          userLedgerBefore: before,
          userLedgerAfter: after,
          expectedUserLedgerDelta: targetAmount,
        });
      } catch (e: any) {
        console.warn('[Obiex collection] recon failed', e?.message || e);
      }
    }

    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'completed',
        obiexStatus: status,
        targetCurrency,
        targetAmount: Number.isFinite(targetAmount)
          ? formatAmountStr(targetAmount, 8)
          : trade.targetAmount,
        completedAt: new Date(),
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          collectionWebhook: event,
        },
      },
    });
    return { handled: true, tradeId: trade.id };
  }

  if (status === 'HELD' || status === 'FAILED' || status === 'PENDING') {
    await tradeModel().updateMany({
      where: {
        id: trade.id,
        status: { notIn: ['completed', 'crediting', 'failed'] },
      },
      data: {
        status:
          status === 'FAILED'
            ? 'failed'
            : status === 'HELD'
              ? 'held'
              : 'awaiting_payment',
        obiexStatus: status,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          collectionWebhook: event,
        },
      },
    });
    return { handled: true, tradeId: trade.id, reason: 'status_ack' };
  }

  return { handled: false, reason: 'unhandled_status' };
}
