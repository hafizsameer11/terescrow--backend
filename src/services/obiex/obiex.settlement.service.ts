import { prisma } from '../../utils/prisma';
import { creditObiexAsset } from './obiex.ledger.service';

const tradeModel = () => (prisma as any).obiexTradeLog;

export async function handleObiexWithdrawalWebhook(event: any) {
  if (String(event?.type || '').toUpperCase() !== 'WITHDRAWAL') {
    return { handled: false, reason: 'not_withdrawal' };
  }

  const reference = event?.reference ? String(event.reference) : null;
  const txId = event?.transactionId ? String(event.transactionId) : null;
  const status = String(event?.status || '').toUpperCase();

  const trade = await tradeModel().findFirst({
    where: {
      side: 'send',
      OR: [
        ...(reference ? [{ obiexReference: reference }] : []),
        ...(txId ? [{ obiexTransactionId: txId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!trade) return { handled: false, reason: 'trade_not_found' };

  if (status === 'SUCCESSFUL') {
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'completed',
        obiexStatus: status,
        completedAt: new Date(),
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          withdrawalWebhook: event,
        },
      },
    });
    return { handled: true, tradeId: trade.id };
  }

  if (status === 'FAILED' || status === 'REJECTED') {
    if (trade.status !== 'failed' && trade.userId) {
      const amount = parseFloat(String(trade.sourceAmount));
      if (Number.isFinite(amount) && amount > 0) {
        await creditObiexAsset(trade.userId, trade.sourceCurrency, amount);
      }
    }
    await tradeModel().update({
      where: { id: trade.id },
      data: {
        status: 'failed',
        obiexStatus: status,
        errorMessage: `Withdrawal ${status}`,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          withdrawalWebhook: event,
        },
      },
    });
    return { handled: true, tradeId: trade.id };
  }

  await tradeModel().update({
    where: { id: trade.id },
    data: {
      obiexStatus: status,
      status: 'processing',
      providerResponse: {
        ...((trade.providerResponse as object) || {}),
        withdrawalWebhook: event,
      },
    },
  });
  return { handled: true, tradeId: trade.id };
}
