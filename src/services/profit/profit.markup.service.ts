import { prisma } from '../../utils/prisma';
import { getBushaMarkupPercents } from '../busha/busha.markup';
import {
  getPlatformOperationSettings,
  updatePlatformOperationSettings,
} from '../admin/platform.operation.settings.service';

function parseAmt(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sell markup stores crypto in bushaSourceAmount / userSourceAmount and NGN in
 * bushaTargetAmount / userCreditNgn. Buy stores NGN in both *SourceAmount fields.
 * Never treat sell crypto source amounts as Naira.
 */
function extractMarkup(
  providerResponse: unknown,
  sideHint?: string | null
): {
  markupPercent: number;
  actualAmountNgn: number;
  userAmountNgn: number;
  adminMarkupNgn: number;
  side?: string;
} | null {
  if (!providerResponse || typeof providerResponse !== 'object') return null;
  const markup = (providerResponse as any).markup;
  if (!markup || typeof markup !== 'object') return null;

  const buyPct = parseAmt(markup.buyMarkupPercent);
  const sellPct = parseAmt(markup.sellMarkupPercent);
  const platformSpread = parseAmt(markup.platformSpreadNgn);
  const bushaTarget = parseAmt(markup.bushaTargetAmount);
  const bushaSource = parseAmt(markup.bushaSourceAmount);
  const userCredit = parseAmt(markup.userCreditNgn || markup.userTargetAmount);
  const userSource = parseAmt(markup.userSourceAmount);
  const userShareBusha = parseAmt(markup.userShareBushaNgn);
  const side = String(sideHint || '').toLowerCase();

  const looksLikeSell =
    side === 'sell' ||
    sellPct > 0 ||
    bushaTarget > 0 ||
    userCredit > 0 ||
    userShareBusha > 0;

  if (looksLikeSell && side !== 'buy') {
    // Prefer NGN fields only — source* on sell is crypto units.
    const actual =
      bushaTarget > 0
        ? bushaTarget
        : userShareBusha > 0
          ? userShareBusha
          : userCredit > 0
            ? userCredit + platformSpread
            : 0;
    const user = userCredit > 0 ? userCredit : actual > 0 ? actual - platformSpread : 0;
    const admin = platformSpread || (actual > 0 && user > 0 ? actual - user : 0);
    if (admin <= 0 && actual <= 0 && user <= 0) {
      // fall through
    } else {
      return {
        side: 'sell',
        markupPercent: sellPct,
        actualAmountNgn: Math.round(actual * 100) / 100,
        userAmountNgn: Math.round(Math.max(0, user) * 100) / 100,
        adminMarkupNgn: Math.round(Math.max(0, admin) * 100) / 100,
      };
    }
  }

  if (side === 'buy' || buyPct > 0 || userSource > 0 || bushaSource > 0) {
    const actual = bushaSource > 0 ? bushaSource : userSource - platformSpread;
    const user = userSource > 0 ? userSource : actual + platformSpread;
    return {
      side: 'buy',
      markupPercent: buyPct,
      actualAmountNgn: Math.round(actual * 100) / 100,
      userAmountNgn: Math.round(user * 100) / 100,
      adminMarkupNgn: Math.round((platformSpread || user - actual) * 100) / 100,
    };
  }

  if (platformSpread > 0) {
    return {
      markupPercent: 0,
      actualAmountNgn: 0,
      userAmountNgn: 0,
      adminMarkupNgn: Math.round(platformSpread * 100) / 100,
    };
  }

  return null;
}

export async function getMarkupProfitOverview(params?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const where: any = {
    side: { in: ['buy', 'sell'] },
  };
  if (params?.startDate || params?.endDate) {
    where.createdAt = {};
    if (params.startDate) where.createdAt.gte = new Date(params.startDate);
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const limit = Math.min(100, Math.max(1, Number(params?.limit) || 40));
  const trades = await prisma.bushaTradeLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      user: {
        select: { id: true, username: true, firstname: true, lastname: true, email: true },
      },
    },
  });

  let totalMarkupNgn = 0;
  let buyMarkupNgn = 0;
  let sellMarkupNgn = 0;
  let tradesWithMarkup = 0;
  const recent: any[] = [];

  for (const t of trades) {
    const m = extractMarkup(t.providerResponse, t.side);
    if (!m || m.adminMarkupNgn <= 0) continue;
    tradesWithMarkup += 1;
    totalMarkupNgn += m.adminMarkupNgn;
    if (String(t.side).toLowerCase() === 'buy' || m.side === 'buy') buyMarkupNgn += m.adminMarkupNgn;
    if (String(t.side).toLowerCase() === 'sell' || m.side === 'sell') sellMarkupNgn += m.adminMarkupNgn;

    if (recent.length < limit) {
      recent.push({
        id: t.id,
        side: t.side,
        status: t.status,
        sourceCurrency: t.sourceCurrency,
        targetCurrency: t.targetCurrency,
        sourceAmount: t.sourceAmount,
        targetAmount: t.targetAmount,
        createdAt: t.createdAt,
        user: t.user,
        markupPercent: m.markupPercent,
        actualAmountNgn: m.actualAmountNgn,
        userAmountNgn: m.userAmountNgn,
        adminMarkupNgn: m.adminMarkupNgn,
      });
    }
  }

  // Bill payment fees from fiat txns
  const billFeeWhere: any = {
    type: 'BILL_PAYMENT',
    fees: { gt: 0 },
  };
  if (where.createdAt) billFeeWhere.createdAt = where.createdAt;

  // Gift card sell profit from agent Transaction.profit (giftCard sell department)
  const [billAgg, gcAgg] = await Promise.all([
    prisma.fiatTransaction.aggregate({
      where: billFeeWhere,
      _sum: { fees: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: {
        profit: { gt: 0 },
        department: { niche: 'giftCard', Type: 'sell' },
        ...(where.createdAt ? { createdAt: where.createdAt } : {}),
      },
      _sum: { profit: true },
      _count: true,
    }),
  ]);

  const giftCardSellProfitNgn = Math.round(parseAmt(gcAgg._sum.profit) * 100) / 100;
  const billPaymentFeeNgn = Math.round(parseAmt(billAgg._sum.fees) * 100) / 100;

  const [bushaMarkup, platform] = await Promise.all([
    getBushaMarkupPercents(),
    getPlatformOperationSettings(),
  ]);

  return {
    summary: {
      cryptoMarkupNgn: Math.round(totalMarkupNgn * 100) / 100,
      buyMarkupNgn: Math.round(buyMarkupNgn * 100) / 100,
      sellMarkupNgn: Math.round(sellMarkupNgn * 100) / 100,
      tradesWithMarkup,
      billPaymentFeeNgn,
      billPaymentsWithFee: billAgg._count || 0,
      giftCardSellProfitNgn,
      giftCardSellsWithProfit: gcAgg._count || 0,
      totalProfitNgn:
        Math.round((totalMarkupNgn + billPaymentFeeNgn + giftCardSellProfitNgn) * 100) / 100,
    },
    settings: {
      buyMarkupPercent: bushaMarkup.buyMarkupPercent,
      sellMarkupPercent: bushaMarkup.sellMarkupPercent,
      billPaymentFeePercent: platform.billPaymentFeePercent,
      billPaymentFeeLabel: platform.billPaymentFeeLabel,
    },
    recentMarkupTrades: recent,
  };
}

export async function getProfitFeeSettings() {
  const [bushaMarkup, platform] = await Promise.all([
    getBushaMarkupPercents(),
    getPlatformOperationSettings(),
  ]);
  return {
    buyMarkupPercent: bushaMarkup.buyMarkupPercent,
    sellMarkupPercent: bushaMarkup.sellMarkupPercent,
    billPaymentFeePercent: platform.billPaymentFeePercent,
    billPaymentFeeLabel: platform.billPaymentFeeLabel,
    note: 'Crypto buy/sell markup % is edited on Rates → Crypto rates. Bill payment fee is set here.',
  };
}

export async function updateProfitFeeSettings(input: {
  billPaymentFeePercent?: number | string;
  billPaymentFeeLabel?: string;
}) {
  return updatePlatformOperationSettings({
    billPaymentFeePercent: input.billPaymentFeePercent,
    billPaymentFeeLabel: input.billPaymentFeeLabel,
  });
}

export function markupFromProviderResponse(providerResponse: unknown) {
  return extractMarkup(providerResponse);
}
