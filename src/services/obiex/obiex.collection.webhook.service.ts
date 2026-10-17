import { prisma } from '../../utils/prisma';
import { creditObiexAsset } from './obiex.ledger.service';
import { formatAmountStr } from './obiex.markup';

const tradeModel = () => (prisma as any).obiexTradeLog;

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
    const targetCurrency = String(event?.targetCurrency || trade.targetCurrency || 'USDT').toUpperCase();
    const targetAmount = Number(event?.targetAmount);
    if (trade.userId && Number.isFinite(targetAmount) && targetAmount > 0) {
      await creditObiexAsset(trade.userId, targetCurrency, targetAmount);
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
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: status === 'FAILED' ? 'failed' : status === 'HELD' ? 'held' : 'awaiting_payment',
        obiexStatus: status,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          collectionWebhook: event,
        },
      },
    });
    return { handled: true, tradeId: trade.id };
  }

  return { handled: false, reason: 'unhandled_status' };
}
