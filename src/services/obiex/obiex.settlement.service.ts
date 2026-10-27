import { prisma } from '../../utils/prisma';
import { creditObiexAsset } from './obiex.ledger.service';

const tradeModel = () => (prisma as any).obiexTradeLog;

/**
 * WITHDRAWAL webhooks: same transactionId gets APPROVED then SUCCESSFUL (or FAILED).
 * Never debit here (already debited at send). Refund at most once on FAILED/REJECTED.
 */
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

  // Attach provider tx id if we only matched by reference
  if (txId && !trade.obiexTransactionId) {
    try {
      await tradeModel().update({
        where: { id: trade.id },
        data: { obiexTransactionId: txId },
      });
    } catch {
      /* unique conflict — ignore */
    }
  }

  if (status === 'SUCCESSFUL') {
    await tradeModel().updateMany({
      where: {
        id: trade.id,
        status: { notIn: ['failed', 'refunding'] },
      },
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
    return { handled: true, tradeId: trade.id, reason: 'completed' };
  }

  if (status === 'FAILED' || status === 'REJECTED') {
    // Claim once — only from in-flight states (not after SUCCESSFUL completed, not already failed)
    const claimed = await tradeModel().updateMany({
      where: {
        id: trade.id,
        status: { in: ['pending', 'processing'] },
      },
      data: {
        status: 'refunding',
        obiexStatus: status,
        errorMessage: `Withdrawal ${status}`,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          withdrawalWebhook: event,
        },
      },
    });

    if (!claimed.count) {
      // Already completed successfully, already refunding/failed, or unknown — no second refund
      return {
        handled: true,
        tradeId: trade.id,
        reason: 'refund_skipped',
        status: trade.status,
      };
    }

    if (trade.userId) {
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
      },
    });
    return { handled: true, tradeId: trade.id, reason: 'refunded' };
  }

  // APPROVED / PENDING / PROCESSING — status update only, never move balances
  await tradeModel().updateMany({
    where: {
      id: trade.id,
      status: { notIn: ['completed', 'failed', 'refunding'] },
    },
    data: {
      obiexStatus: status,
      status: 'processing',
      providerResponse: {
        ...((trade.providerResponse as object) || {}),
        withdrawalWebhook: event,
      },
    },
  });
  return { handled: true, tradeId: trade.id, reason: 'status_ack', providerStatus: status };
}
