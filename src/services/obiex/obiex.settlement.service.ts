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
      // Refund full ledger debit (amount + fees), not only sourceAmount.
      const fees = (trade.providerResponse as any)?.fees;
      const totalDebit = parseFloat(String(fees?.totalDebit ?? ''));
      const sourceAmt = parseFloat(String(trade.sourceAmount));
      const refund =
        Number.isFinite(totalDebit) && totalDebit > 0
          ? totalDebit
          : Number.isFinite(sourceAmt) && sourceAmt > 0
            ? sourceAmt
            : 0;
      if (refund > 0) {
        await creditObiexAsset(trade.userId, trade.sourceCurrency, refund);
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
