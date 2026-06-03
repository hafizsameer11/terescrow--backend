import { Decimal } from '@prisma/client/runtime/library';
import { BalanceBucket } from '@prisma/client';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import { prisma } from '../../utils/prisma';

export interface ReceiveSoldTotals {
  soldAmount: string;
  soldAmountUsd: string;
  soldAmountNaira: string;
  /** Receive USD minus sold USD (floored at 0). */
  userRetentionUsd: string;
}

const ON_CHAIN_SELL_WHERE = {
  transactionType: 'SELL' as const,
  status: 'successful' as const,
  OR: [{ balanceBucket: BalanceBucket.on_chain }, { balanceBucket: null }],
};

type ReceiveFifoRow = {
  id: number;
  amount: Decimal;
  amountUsd: Decimal;
  amountNaira: Decimal;
};

type SellFifoRow = {
  amount: Decimal;
  amountUsd: Decimal;
  amountNaira: Decimal;
};

type AllocationState = {
  soldCrypto: Decimal;
  soldUsd: Decimal;
  soldNaira: Decimal;
};

function emptyTotals(receiveAmountUsd: Decimal | number | string): ReceiveSoldTotals {
  return {
    soldAmount: '0',
    soldAmountUsd: '0',
    soldAmountNaira: '0',
    userRetentionUsd: new Decimal(receiveAmountUsd.toString()).toString(),
  };
}

function toTotals(
  receiveAmountUsd: Decimal | number | string,
  alloc: AllocationState
): ReceiveSoldTotals {
  const recvUsd = new Decimal(receiveAmountUsd.toString());
  const retention = Decimal.max(recvUsd.minus(alloc.soldUsd), new Decimal(0));
  return {
    soldAmount: formatCryptoAmount(alloc.soldCrypto),
    soldAmountUsd: alloc.soldUsd.toString(),
    soldAmountNaira: alloc.soldNaira.toString(),
    userRetentionUsd: retention.toString(),
  };
}

/**
 * Attribute on-chain sells to receives FIFO (oldest deposit first).
 * Prevents a later deposit from inheriting sells that consumed earlier deposits' balance.
 */
function allocateSellsFifo(
  receives: ReceiveFifoRow[],
  sells: SellFifoRow[]
): Map<number, AllocationState> {
  const remaining = new Map<number, Decimal>();
  for (const r of receives) {
    remaining.set(r.id, new Decimal(r.amount.toString()));
  }

  const allocated = new Map<number, AllocationState>();
  for (const r of receives) {
    allocated.set(r.id, {
      soldCrypto: new Decimal(0),
      soldUsd: new Decimal(0),
      soldNaira: new Decimal(0),
    });
  }

  for (const sell of sells) {
    const sellCrypto = new Decimal(sell.amount.toString());
    const sellUsd = new Decimal(sell.amountUsd.toString());
    const sellNaira = new Decimal(sell.amountNaira.toString());
    if (sellCrypto.lte(0)) continue;

    let sellLeft = sellCrypto;

    for (const recv of receives) {
      if (sellLeft.lte(0)) break;

      const cap = remaining.get(recv.id) ?? new Decimal(0);
      if (cap.lte(0)) continue;

      const take = Decimal.min(sellLeft, cap);
      const ratio = take.div(sellCrypto);
      const takeUsd = sellUsd.mul(ratio);
      const takeNaira = sellNaira.mul(ratio);

      const state = allocated.get(recv.id)!;
      state.soldCrypto = state.soldCrypto.plus(take);
      state.soldUsd = state.soldUsd.plus(takeUsd);
      state.soldNaira = state.soldNaira.plus(takeNaira);

      remaining.set(recv.id, cap.minus(take));
      sellLeft = sellLeft.minus(take);
    }
  }

  return allocated;
}

async function loadFifoData(userId: number, virtualAccountId: number) {
  const [receiveTxs, sellTxs] = await Promise.all([
    prisma.cryptoTransaction.findMany({
      where: {
        transactionType: 'RECEIVE',
        userId,
        virtualAccountId,
        cryptoReceive: { isNot: null },
      },
      orderBy: { createdAt: 'asc' },
      include: { cryptoReceive: true },
    }),
    prisma.cryptoTransaction.findMany({
      where: {
        userId,
        virtualAccountId,
        ...ON_CHAIN_SELL_WHERE,
      },
      orderBy: { createdAt: 'asc' },
      include: { cryptoSell: true },
    }),
  ]);

  const receives: ReceiveFifoRow[] = receiveTxs
    .filter((tx) => tx.cryptoReceive)
    .map((tx) => {
      const recv = tx.cryptoReceive!;
      return {
        id: tx.id,
        amount: new Decimal((recv.creditedAmount ?? recv.amount).toString()),
        amountUsd: new Decimal((recv.creditedAmountUsd ?? recv.amountUsd).toString()),
        amountNaira: new Decimal(recv.amountNaira?.toString() ?? '0'),
      };
    });

  const sells: SellFifoRow[] = sellTxs
    .filter((tx) => tx.cryptoSell)
    .map((tx) => ({
      amount: tx.cryptoSell!.amount,
      amountUsd: tx.cryptoSell!.amountUsd,
      amountNaira: tx.cryptoSell!.amountNaira,
    }));

  return { receives, sells };
}

export async function getSoldTotalsForReceive(input: {
  receiveCryptoTxId: number;
  userId: number;
  virtualAccountId: number | null;
  receiveCreatedAt: Date;
  receiveAmountUsd: Decimal | number | string;
}): Promise<ReceiveSoldTotals> {
  if (!input.virtualAccountId) {
    return emptyTotals(input.receiveAmountUsd);
  }

  const { receives, sells } = await loadFifoData(input.userId, input.virtualAccountId);
  const target = receives.find((r) => r.id === input.receiveCryptoTxId);
  if (!target) return emptyTotals(input.receiveAmountUsd);

  const allocated = allocateSellsFifo(receives, sells);
  const state = allocated.get(input.receiveCryptoTxId) ?? {
    soldCrypto: new Decimal(0),
    soldUsd: new Decimal(0),
    soldNaira: new Decimal(0),
  };

  return toTotals(input.receiveAmountUsd, state);
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
  if (rows.length === 0) return map;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.virtualAccountId) {
      map.set(row.id, emptyTotals(row.amountUsd));
      continue;
    }
    const key = `${row.userId}:${row.virtualAccountId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  await Promise.all(
    [...groups.entries()].map(async ([key, groupRows]) => {
      const [userIdStr, vaIdStr] = key.split(':');
      const userId = Number(userIdStr);
      const virtualAccountId = Number(vaIdStr);

      const { receives, sells } = await loadFifoData(userId, virtualAccountId);
      const allocated = allocateSellsFifo(receives, sells);

      const receiveUsdById = new Map(receives.map((r) => [r.id, r.amountUsd]));

      for (const row of groupRows) {
        const state = allocated.get(row.id) ?? {
          soldCrypto: new Decimal(0),
          soldUsd: new Decimal(0),
          soldNaira: new Decimal(0),
        };
        const recvUsd = receiveUsdById.get(row.id) ?? row.amountUsd;
        map.set(row.id, toTotals(recvUsd, state));
      }
    })
  );

  return map;
}
