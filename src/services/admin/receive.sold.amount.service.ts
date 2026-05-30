import { Decimal } from '@prisma/client/runtime/library';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import { prisma } from '../../utils/prisma';

export interface ReceiveSoldTotals {
  soldAmount: string;
  soldAmountUsd: string;
  soldAmountNaira: string;
  /** Receive USD minus sold USD (floored at 0). */
  userRetentionUsd: string;
}

/**
 * Sells on the same virtual account after this receive (until the next receive on that VA).
 * Excludes BUY and other tx types — only successful SELL.
 */
export async function getSoldTotalsForReceive(input: {
  receiveCryptoTxId: number;
  userId: number;
  virtualAccountId: number | null;
  receiveCreatedAt: Date;
  receiveAmountUsd: Decimal | number | string;
}): Promise<ReceiveSoldTotals> {
  const zero = {
    soldAmount: '0',
    soldAmountUsd: '0',
    soldAmountNaira: '0',
    userRetentionUsd: new Decimal(input.receiveAmountUsd.toString()).toString(),
  };

  if (!input.virtualAccountId) return zero;

  const nextReceive = await prisma.cryptoTransaction.findFirst({
    where: {
      transactionType: 'RECEIVE',
      virtualAccountId: input.virtualAccountId,
      userId: input.userId,
      createdAt: { gt: input.receiveCreatedAt },
      id: { not: input.receiveCryptoTxId },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const sells = await prisma.cryptoTransaction.findMany({
    where: {
      transactionType: 'SELL',
      userId: input.userId,
      virtualAccountId: input.virtualAccountId,
      status: 'successful',
      createdAt: {
        gte: input.receiveCreatedAt,
        ...(nextReceive ? { lt: nextReceive.createdAt } : {}),
      },
    },
    include: { cryptoSell: true },
  });

  let soldAmount = new Decimal(0);
  let soldAmountUsd = new Decimal(0);
  let soldAmountNaira = new Decimal(0);

  for (const row of sells) {
    const sell = row.cryptoSell;
    if (!sell) continue;
    soldAmount = soldAmount.plus(sell.amount.toString());
    soldAmountUsd = soldAmountUsd.plus(sell.amountUsd.toString());
    soldAmountNaira = soldAmountNaira.plus(sell.amountNaira.toString());
  }

  const recvUsd = new Decimal(input.receiveAmountUsd.toString());
  const retention = Decimal.max(recvUsd.minus(soldAmountUsd), new Decimal(0));

  return {
    soldAmount: formatCryptoAmount(soldAmount),
    soldAmountUsd: soldAmountUsd.toString(),
    soldAmountNaira: soldAmountNaira.toString(),
    userRetentionUsd: retention.toString(),
  };
}

export async function getSoldTotalsMapForReceives(
  rows: {
    id: number;
    userId: number;
    virtualAccountId: number | null;
    createdAt: Date;
    amountUsd: Decimal | number | string;
  }[]
): Promise<Map<number, ReceiveSoldTotals>> {
  const map = new Map<number, ReceiveSoldTotals>();
  await Promise.all(
    rows.map(async (r) => {
      const totals = await getSoldTotalsForReceive({
        receiveCryptoTxId: r.id,
        userId: r.userId,
        virtualAccountId: r.virtualAccountId,
        receiveCreatedAt: r.createdAt,
        receiveAmountUsd: r.amountUsd,
      });
      map.set(r.id, totals);
    })
  );
  return map;
}
