import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import profitLedgerService from '../profit/profit.ledger.service';

const TOLERANCE = new Decimal('0.00000001');

export type BushaFeeType = 'DEPOSIT_FEE' | 'WITHDRAW_FEE';

function d(v: string | number | Decimal | null | undefined): Decimal {
  if (v == null) return new Decimal(0);
  if (v instanceof Decimal) return v;
  const n = new Decimal(String(v).replace(/,/g, '') || '0');
  return n.isNaN() ? new Decimal(0) : n;
}

function roundCrypto(v: Decimal, places = 12): Decimal {
  return v.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

function roundNgn(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export async function getCoinFeePercents(currency: string): Promise<{
  depositFeePercent: number;
  withdrawFeePercent: number;
  isActive: boolean;
}> {
  const code = String(currency || '').toUpperCase();
  const row = await (prisma as any).bushaCoinFeeConfig.findUnique({ where: { currency: code } });
  if (!row || !row.isActive) {
    return { depositFeePercent: 0, withdrawFeePercent: 0, isActive: false };
  }
  return {
    depositFeePercent: Number(row.depositFeePercent?.toString?.() ?? row.depositFeePercent ?? 0) || 0,
    withdrawFeePercent: Number(row.withdrawFeePercent?.toString?.() ?? row.withdrawFeePercent ?? 0) || 0,
    isActive: true,
  };
}

export async function listCoinFeeConfigs() {
  return (prisma as any).bushaCoinFeeConfig.findMany({ orderBy: { currency: 'asc' } });
}

export async function upsertCoinFeeConfigs(
  rules: Array<{
    currency: string;
    depositFeePercent?: number;
    withdrawFeePercent?: number;
    isActive?: boolean;
  }>
) {
  const results = [];
  for (const r of rules) {
    const currency = String(r.currency || '').toUpperCase().trim();
    if (!currency) continue;
    const depositFeePercent = Math.max(0, Math.min(100, Number(r.depositFeePercent ?? 0) || 0));
    const withdrawFeePercent = Math.max(0, Math.min(100, Number(r.withdrawFeePercent ?? 0) || 0));
    const isActive = r.isActive !== false;
    const row = await (prisma as any).bushaCoinFeeConfig.upsert({
      where: { currency },
      create: {
        currency,
        depositFeePercent,
        withdrawFeePercent,
        isActive,
      },
      update: {
        depositFeePercent,
        withdrawFeePercent,
        isActive,
      },
    });
    results.push(row);
  }
  return results;
}

export async function getOrCreateAsset(userId: number, currency: string) {
  const code = String(currency || '').toUpperCase();
  let asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId, currency: code } },
  });
  if (!asset) {
    asset = await (prisma as any).bushaUserAsset.create({
      data: {
        id: uuidv4(),
        userId,
        currency: code,
        userAvailable: 0,
        feeHeld: 0,
      },
    });
  }
  return asset;
}

/**
 * Display balance for the user:
 * - if feeHeld > 0 → userAvailable (clamped by busha - feeHeld)
 * - else → busha balance directly
 */
export async function getDisplayBalance(
  userId: number,
  currency: string,
  bushaBalance: string | number
): Promise<{
  display: string;
  busha: string;
  userAvailable: string;
  feeHeld: string;
  useLedger: boolean;
  mismatch: boolean;
}> {
  const code = String(currency || '').toUpperCase();
  const busha = d(bushaBalance);
  const asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId, currency: code } },
  });

  if (!asset) {
    return {
      display: busha.toString(),
      busha: busha.toString(),
      userAvailable: busha.toString(),
      feeHeld: '0',
      useLedger: false,
      mismatch: false,
    };
  }

  const feeHeld = d(asset.feeHeld);
  const userAvailable = d(asset.userAvailable);
  const useLedger = feeHeld.gt(0);

  let display = useLedger ? userAvailable : busha;
  let mismatch = false;

  if (useLedger) {
    const maxDisplay = Decimal.max(new Decimal(0), busha.minus(feeHeld));
    if (display.gt(maxDisplay.add(TOLERANCE))) {
      display = maxDisplay;
      mismatch = true;
    }
    const expected = userAvailable.plus(feeHeld);
    if (busha.minus(expected).abs().gt(TOLERANCE.mul(1000))) {
      mismatch = true;
    }
  }

  return {
    display: roundCrypto(display).toString(),
    busha: roundCrypto(busha).toString(),
    userAvailable: roundCrypto(userAvailable).toString(),
    feeHeld: roundCrypto(feeHeld).toString(),
    useLedger,
    mismatch,
  };
}

export async function reconcileAgainstBusha(
  userId: number,
  currency: string,
  bushaBalance: string | number
) {
  const code = String(currency || '').toUpperCase();
  const busha = d(bushaBalance);
  const asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId, currency: code } },
  });
  if (!asset) {
    return { mismatch: false, asset: null };
  }

  const feeHeld = d(asset.feeHeld);
  const userAvailable = d(asset.userAvailable);
  const expected = userAvailable.plus(feeHeld);
  const mismatch = feeHeld.gt(0) && busha.minus(expected).abs().gt(TOLERANCE.mul(1000));

  const updated = await (prisma as any).bushaUserAsset.update({
    where: { id: asset.id },
    data: {
      lastBushaBalance: roundCrypto(busha),
      lastReconciledAt: new Date(),
      reconcileMismatch: mismatch,
    },
  });

  if (mismatch) {
    console.warn(
      `[Busha ledger] mismatch user=${userId} ${code}: busha=${busha} available=${userAvailable} held=${feeHeld}`
    );
  }

  return { mismatch, asset: updated };
}

/**
 * Apply deposit fee after Busha credited gross crypto.
 * Idempotent on sourceTradeId.
 */
export async function applyDepositFee(params: {
  userId: number;
  currency: string;
  grossAmount: string | number;
  sourceTradeId: string;
}) {
  const code = String(params.currency || '').toUpperCase();
  const gross = d(params.grossAmount);
  if (!params.userId || gross.lte(0)) {
    return { fee: '0', credited: gross.toString(), skipped: true as const };
  }

  const existing = await (prisma as any).bushaFeeLedger.findFirst({
    where: { sourceTradeId: params.sourceTradeId, type: 'DEPOSIT_FEE' },
  });
  if (existing) {
    return {
      fee: d(existing.amountCrypto).toString(),
      credited: gross.minus(d(existing.amountCrypto)).toString(),
      skipped: true as const,
    };
  }

  const { depositFeePercent } = await getCoinFeePercents(code);
  const fee =
    depositFeePercent > 0
      ? roundCrypto(gross.mul(depositFeePercent).div(100))
      : new Decimal(0);
  const credited = roundCrypto(Decimal.max(new Decimal(0), gross.minus(fee)));

  // No platform deposit fee → leave ledger alone; UI shows Busha balance directly.
  if (fee.lte(0)) {
    return { fee: '0', credited: gross.toString(), skipped: false as const };
  }

  await getOrCreateAsset(params.userId, code);

  await prisma.$transaction(async (tx) => {
    const asset = await (tx as any).bushaUserAsset.findUnique({
      where: { userId_currency: { userId: params.userId, currency: code } },
    });
    await (tx as any).bushaUserAsset.update({
      where: { id: asset.id },
      data: {
        userAvailable: roundCrypto(d(asset.userAvailable).plus(credited)),
        feeHeld: roundCrypto(d(asset.feeHeld).plus(fee)),
      },
    });
    if (fee.gt(0)) {
      await (tx as any).bushaFeeLedger.create({
        data: {
          id: uuidv4(),
          userId: params.userId,
          currency: code,
          type: 'DEPOSIT_FEE',
          amountCrypto: fee,
          status: 'held',
          sourceTradeId: params.sourceTradeId,
        },
      });
    }
  });

  return { fee: fee.toString(), credited: credited.toString(), skipped: false as const };
}

/**
 * After a successful send: debit available for amount + ourFee + networkFee; hold ourFee.
 */
export async function applyWithdrawFee(params: {
  userId: number;
  currency: string;
  sendAmount: string | number;
  ourFee: string | number;
  networkFee: string | number;
  sourceTradeId: string;
}) {
  const code = String(params.currency || '').toUpperCase();
  const sendAmount = d(params.sendAmount);
  const ourFee = roundCrypto(d(params.ourFee));
  const networkFee = roundCrypto(d(params.networkFee));
  const totalDebit = roundCrypto(sendAmount.plus(ourFee).plus(networkFee));

  const existing = await (prisma as any).bushaFeeLedger.findFirst({
    where: { sourceTradeId: params.sourceTradeId, type: 'WITHDRAW_FEE' },
  });
  if (existing) {
    return { ourFee: d(existing.amountCrypto).toString(), skipped: true as const };
  }

  await getOrCreateAsset(params.userId, code);

  await prisma.$transaction(async (tx) => {
    const asset = await (tx as any).bushaUserAsset.findUnique({
      where: { userId_currency: { userId: params.userId, currency: code } },
    });
    const nextAvailable = roundCrypto(d(asset.userAvailable).minus(totalDebit));
    if (nextAvailable.lt(0) && d(asset.feeHeld).lte(0)) {
      // No prior ledger — sync from spend without going deeply negative when only Busha was used
    }
    await (tx as any).bushaUserAsset.update({
      where: { id: asset.id },
      data: {
        userAvailable: Decimal.max(new Decimal(0), nextAvailable),
        feeHeld: roundCrypto(d(asset.feeHeld).plus(ourFee)),
      },
    });
    if (ourFee.gt(0)) {
      await (tx as any).bushaFeeLedger.create({
        data: {
          id: uuidv4(),
          userId: params.userId,
          currency: code,
          type: 'WITHDRAW_FEE',
          amountCrypto: ourFee,
          status: 'held',
          sourceTradeId: params.sourceTradeId,
        },
      });
    }
  });

  return { ourFee: ourFee.toString(), skipped: false as const };
}

/** Compute withdraw platform fee for a send amount. */
export async function computeWithdrawFeeAmount(
  currency: string,
  sendAmount: string | number
): Promise<Decimal> {
  const { withdrawFeePercent } = await getCoinFeePercents(currency);
  if (withdrawFeePercent <= 0) return new Decimal(0);
  return roundCrypto(d(sendAmount).mul(withdrawFeePercent).div(100));
}

/**
 * Peek held fees to add to Busha sell source (does not mark sold yet).
 */
export async function getHeldFeeAmount(userId: number, currency: string): Promise<Decimal> {
  const code = String(currency || '').toUpperCase();
  const asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId, currency: code } },
  });
  return asset ? d(asset.feeHeld) : new Decimal(0);
}

/**
 * After successful sell settlement: debit userAvailable by U, clear feeHeld,
 * mark all held ledger rows sold with NGN split for fee portion.
 */
export async function settleSellWithHeldFees(params: {
  userId: number;
  currency: string;
  userSellAmount: string | number;
  bushaTotalNgn: string | number;
  soldTradeId: string;
}) {
  const code = String(params.currency || '').toUpperCase();
  const U = d(params.userSellAmount);
  const totalNgn = d(params.bushaTotalNgn);

  const asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId: params.userId, currency: code } },
  });
  if (!asset) {
    return { feeSold: '0', feeNgn: '0', userNgnShare: totalNgn.toString() };
  }

  const F = d(asset.feeHeld);
  const denom = U.plus(F);
  const feeNgn =
    F.gt(0) && denom.gt(0) ? roundNgn(totalNgn.mul(F).div(denom)) : new Decimal(0);
  const userNgnShare = roundNgn(totalNgn.minus(feeNgn));

  await prisma.$transaction(async (tx) => {
    await (tx as any).bushaUserAsset.update({
      where: { id: asset.id },
      data: {
        userAvailable: roundCrypto(Decimal.max(new Decimal(0), d(asset.userAvailable).minus(U))),
        feeHeld: new Decimal(0),
      },
    });

    if (F.gt(0)) {
      await (tx as any).bushaFeeLedger.updateMany({
        where: { userId: params.userId, currency: code, status: 'held' },
        data: {
          status: 'sold',
          soldTradeId: params.soldTradeId,
          soldAt: new Date(),
        },
      });

      // Attribute NGN across held rows proportionally
      const heldRows = await (tx as any).bushaFeeLedger.findMany({
        where: { userId: params.userId, currency: code, soldTradeId: params.soldTradeId },
      });
      let allocated = new Decimal(0);
      for (let i = 0; i < heldRows.length; i++) {
        const row = heldRows[i];
        const amt = d(row.amountCrypto);
        const share =
          i === heldRows.length - 1
            ? roundNgn(feeNgn.minus(allocated))
            : F.gt(0)
              ? roundNgn(feeNgn.mul(amt).div(F))
              : new Decimal(0);
        allocated = allocated.plus(share);
        await (tx as any).bushaFeeLedger.update({
          where: { id: row.id },
          data: { soldAmountNgn: share },
        });
      }
    }
  });

  if (feeNgn.gt(0)) {
    await profitLedgerService
      .record({
        sourceTransactionType: 'BUSHA_FEE_LEDGER',
        sourceTransactionId: params.soldTradeId,
        transactionType: 'CRYPTO_SELL',
        asset: code,
        service: 'busha_held_fee_liquidation',
        amount: F.toString(),
        amountNgn: feeNgn.toString(),
        forcedProfit: {
          profitType: 'FIXED',
          profitValue: feeNgn.toString(),
          profitNgn: feeNgn.toString(),
          notes: 'Held deposit/withdraw fee liquidated on sell',
        },
        eventKey: `BUSHA_FEE_LIQUIDATION:${params.soldTradeId}`,
      })
      .catch((err) => console.warn('[Busha ledger] profit record failed', err?.message));
  }

  return {
    feeSold: F.toString(),
    feeNgn: feeNgn.toString(),
    userNgnShare: userNgnShare.toString(),
  };
}

/**
 * When buy credits crypto to Busha with no deposit fee, sync available upward
 * so later holds stay consistent if user already had a ledger row.
 */
export async function creditBuyToLedger(params: {
  userId: number;
  currency: string;
  amount: string | number;
  sourceTradeId?: string;
}) {
  const code = String(params.currency || '').toUpperCase();
  const amt = d(params.amount);
  if (amt.lte(0)) return;

  await getOrCreateAsset(params.userId, code);
  const asset = await (prisma as any).bushaUserAsset.findUnique({
    where: { userId_currency: { userId: params.userId, currency: code } },
  });
  // Only bump ledger if user already has held fees (otherwise we pass Busha through)
  if (asset && d(asset.feeHeld).gt(0)) {
    await (prisma as any).bushaUserAsset.update({
      where: { id: asset.id },
      data: { userAvailable: roundCrypto(d(asset.userAvailable).plus(amt)) },
    });
  }
}

export async function listFeeLedgerAdmin(filters: {
  status?: string;
  currency?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }
  if (filters.currency) {
    where.currency = String(filters.currency).toUpperCase();
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.user = {
      OR: [
        { username: { contains: q } },
        { firstname: { contains: q } },
        { lastname: { contains: q } },
        { email: { contains: q } },
      ],
    };
  }

  const [rows, count, heldAgg, soldAgg] = await Promise.all([
    (prisma as any).bushaFeeLedger.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    }),
    (prisma as any).bushaFeeLedger.count({ where }),
    (prisma as any).bushaFeeLedger.groupBy({
      by: ['currency'],
      where: { status: 'held' },
      _sum: { amountCrypto: true },
    }),
    (prisma as any).bushaFeeLedger.aggregate({
      where: { status: 'sold' },
      _sum: { soldAmountNgn: true },
    }),
  ]);

  return {
    rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 0,
    totals: {
      heldByCurrency: (heldAgg || []).map((h: any) => ({
        currency: h.currency,
        amount: h._sum?.amountCrypto?.toString?.() ?? String(h._sum?.amountCrypto ?? 0),
      })),
      soldNgnEarned: soldAgg?._sum?.soldAmountNgn?.toString?.() ?? '0',
    },
  };
}

export function formatDepositFeeNote(percent: number): string | null {
  if (!Number.isFinite(percent) || percent <= 0) return null;
  const pretty = percent % 1 === 0 ? String(percent) : String(percent);
  return `${pretty}% fee applies on deposit`;
}
