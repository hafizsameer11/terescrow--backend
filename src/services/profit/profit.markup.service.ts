import { prisma } from '../../utils/prisma';
import { getBushaMarkupPercents } from '../busha/busha.markup';
import { getObiexFlatFeesNgn, getObiexMarkupPercents } from '../obiex/obiex.markup';
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
  netPlatformProfitNgn?: number;
  flatFeeNgn?: number;
  providerFeesNgn?: number;
  side?: string;
  provider?: string;
} | null {
  if (!providerResponse || typeof providerResponse !== 'object') return null;
  const root = providerResponse as any;
  const markup = root.markup;
  const feesForAdmin = root.feesForAdmin && typeof root.feesForAdmin === 'object' ? root.feesForAdmin : null;

  // Obiex (and any provider) that stores explicit net P&L — prefer that for admin profit/loss.
  if (feesForAdmin) {
    const net = parseAmt(feesForAdmin.netPlatformProfitNgn);
    const gross = parseAmt(feesForAdmin.grossPlatformProfitNgn);
    const userNgn = parseAmt(feesForAdmin.userNgn);
    const obiexNgn = parseAmt(feesForAdmin.obiexNgn);
    const side =
      String(feesForAdmin.side || sideHint || '').toLowerCase() === 'sell' ? 'sell' : 'buy';
    const markupPercent =
      parseAmt(feesForAdmin.markupPercent) ||
      parseAmt(markup?.buyMarkupPercent) ||
      parseAmt(markup?.sellMarkupPercent);
    if (Number.isFinite(net) || Number.isFinite(gross)) {
      return {
        side,
        provider: 'obiex',
        markupPercent,
        actualAmountNgn: Math.round(obiexNgn * 100) / 100,
        userAmountNgn: Math.round(userNgn * 100) / 100,
        // Gross platform take (flat + %); net after provider fees can be negative (loss).
        adminMarkupNgn: Math.round((Number.isFinite(gross) ? gross : net) * 100) / 100,
        netPlatformProfitNgn: Math.round(net * 100) / 100,
        flatFeeNgn: Math.round(parseAmt(feesForAdmin.flatFeeNgn) * 100) / 100,
        providerFeesNgn: Math.round(parseAmt(feesForAdmin.providerFeesNgn) * 100) / 100,
      };
    }
  }

  if (!markup || typeof markup !== 'object') return null;

  const buyPct = parseAmt(markup.buyMarkupPercent);
  const sellPct = parseAmt(markup.sellMarkupPercent);
  const platformSpread = parseAmt(markup.platformSpreadNgn);
  const bushaTarget = parseAmt(markup.bushaTargetAmount);
  const bushaSource = parseAmt(markup.bushaSourceAmount);
  const obiexSource = parseAmt(markup.obiexSourceAmount);
  const obiexTarget = parseAmt(markup.obiexTargetAmount);
  const userCredit = parseAmt(markup.userCreditNgn || markup.userTargetAmount);
  const userSource = parseAmt(markup.userSourceAmount);
  const userShareBusha = parseAmt(markup.userShareBushaNgn);
  const flatFeeNgn = parseAmt(markup.buyFlatFeeNgn || markup.sellFlatFeeNgn);
  const side = String(sideHint || '').toLowerCase();

  const looksLikeSell =
    side === 'sell' ||
    sellPct > 0 ||
    bushaTarget > 0 ||
    obiexTarget > 0 ||
    userCredit > 0 ||
    userShareBusha > 0;

  if (looksLikeSell && side !== 'buy') {
    // Prefer NGN fields only — source* on sell is crypto units.
    const actual =
      bushaTarget > 0
        ? bushaTarget
        : obiexTarget > 0
          ? obiexTarget
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
        flatFeeNgn: flatFeeNgn > 0 ? Math.round(flatFeeNgn * 100) / 100 : undefined,
      };
    }
  }

  if (side === 'buy' || buyPct > 0 || userSource > 0 || bushaSource > 0 || obiexSource > 0) {
    const actual =
      bushaSource > 0 ? bushaSource : obiexSource > 0 ? obiexSource : userSource - platformSpread;
    const user = userSource > 0 ? userSource : actual + platformSpread;
    return {
      side: 'buy',
      markupPercent: buyPct,
      actualAmountNgn: Math.round(actual * 100) / 100,
      userAmountNgn: Math.round(user * 100) / 100,
      adminMarkupNgn: Math.round((platformSpread || user - actual) * 100) / 100,
      flatFeeNgn: flatFeeNgn > 0 ? Math.round(flatFeeNgn * 100) / 100 : undefined,
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
    // Match getChatStats: date-only bounds use local day; ISO strings keep clock-in precision
    if (params.startDate) {
      where.createdAt.gte = new Date(
        params.startDate.includes('T') ? params.startDate : `${params.startDate}T00:00:00`
      );
    }
    if (params.endDate) {
      const end = new Date(
        params.endDate.includes('T') ? params.endDate : `${params.endDate}T00:00:00`
      );
      if (!params.endDate.includes('T')) {
        end.setHours(23, 59, 59, 999);
      }
      where.createdAt.lte = end;
    }
  }

  const limit = Math.min(100, Math.max(1, Number(params?.limit) || 40));
  const userSelect = {
    id: true,
    username: true,
    firstname: true,
    lastname: true,
    email: true,
  } as const;

  const [bushaTrades, obiexTrades] = await Promise.all([
    prisma.bushaTradeLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: { select: userSelect } },
    }),
    (prisma as any).obiexTradeLog
      ? (prisma as any).obiexTradeLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: { user: { select: userSelect } },
        })
      : Promise.resolve([]),
  ]);

  const trades = [
    ...bushaTrades.map((t: any) => ({ ...t, _provider: 'busha' })),
    ...obiexTrades.map((t: any) => ({ ...t, _provider: 'obiex' })),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  let totalMarkupNgn = 0;
  let totalNetProfitNgn = 0;
  let buyMarkupNgn = 0;
  let sellMarkupNgn = 0;
  let tradesWithMarkup = 0;
  const recent: any[] = [];

  for (const t of trades) {
    const m = extractMarkup(t.providerResponse, t.side);
    if (!m) continue;
    // Include zero/negative net (loss) when feesForAdmin recorded net P&L; otherwise require gross > 0.
    const net =
      m.netPlatformProfitNgn != null && Number.isFinite(m.netPlatformProfitNgn)
        ? m.netPlatformProfitNgn
        : m.adminMarkupNgn;
    if (m.adminMarkupNgn === 0 && (m.netPlatformProfitNgn == null || m.netPlatformProfitNgn === 0)) {
      continue;
    }
    tradesWithMarkup += 1;
    totalMarkupNgn += m.adminMarkupNgn;
    totalNetProfitNgn += net;
    if (String(t.side).toLowerCase() === 'buy' || m.side === 'buy') buyMarkupNgn += m.adminMarkupNgn;
    if (String(t.side).toLowerCase() === 'sell' || m.side === 'sell') sellMarkupNgn += m.adminMarkupNgn;

    if (recent.length < limit) {
      recent.push({
        id: t.id,
        provider: m.provider || t._provider,
        side: t.side,
        status: t.status,
        sourceCurrency: t.sourceCurrency,
        targetCurrency: t.targetCurrency,
        sourceAmount: t.sourceAmount,
        targetAmount: t.targetAmount,
        createdAt: t.createdAt,
        user: t.user,
        markupPercent: m.markupPercent,
        flatFeeNgn: m.flatFeeNgn ?? 0,
        providerFeesNgn: m.providerFeesNgn ?? 0,
        actualAmountNgn: m.actualAmountNgn,
        userAmountNgn: m.userAmountNgn,
        adminMarkupNgn: m.adminMarkupNgn,
        netPlatformProfitNgn: net,
        isProfit: net >= 0,
      });
    }
  }

  // Bill payment fees from fiat txns
  const billFeeWhere: any = {
    type: 'BILL_PAYMENT',
    fees: { gt: 0 },
  };
  if (where.createdAt) billFeeWhere.createdAt = where.createdAt;

  // Gift card profit from agent Transaction.profit.
  // Match by department niche, chat department, OR cardType (create-card always sets it —
  // covers departments whose niche/Type were misconfigured).
  const giftCardDept = { niche: 'giftCard' as const };
  const [billAgg, gcAgg] = await Promise.all([
    prisma.fiatTransaction.aggregate({
      where: billFeeWhere,
      _sum: { fees: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: {
        OR: [
          { department: giftCardDept },
          { chat: { chatDetails: { department: giftCardDept } } },
          {
            AND: [
              { cardType: { not: null } },
              { NOT: { cardType: '' } },
            ],
          },
          {
            department: {
              title: { contains: 'gift' },
            },
          },
          {
            chat: {
              chatDetails: {
                department: { title: { contains: 'gift' } },
              },
            },
          },
        ],
        ...(where.createdAt ? { createdAt: where.createdAt } : {}),
      },
      _sum: { profit: true },
      _count: true,
    }),
  ]);

  const giftCardSellProfitNgn = Math.round(parseAmt(gcAgg._sum.profit) * 100) / 100;
  const billPaymentFeeNgn = Math.round(parseAmt(billAgg._sum.fees) * 100) / 100;

  const [bushaMarkup, obiexMarkup, obiexFlat, platform] = await Promise.all([
    getBushaMarkupPercents(),
    getObiexMarkupPercents(),
    getObiexFlatFeesNgn(),
    getPlatformOperationSettings(),
  ]);

  const netCrypto = Math.round(totalNetProfitNgn * 100) / 100;

  return {
    summary: {
      cryptoMarkupNgn: Math.round(totalMarkupNgn * 100) / 100,
      cryptoNetProfitNgn: netCrypto,
      buyMarkupNgn: Math.round(buyMarkupNgn * 100) / 100,
      sellMarkupNgn: Math.round(sellMarkupNgn * 100) / 100,
      tradesWithMarkup,
      billPaymentFeeNgn,
      billPaymentsWithFee: billAgg._count || 0,
      giftCardSellProfitNgn,
      giftCardSellsWithProfit: gcAgg._count || 0,
      totalProfitNgn: Math.round((netCrypto + billPaymentFeeNgn + giftCardSellProfitNgn) * 100) / 100,
    },
    settings: {
      buyMarkupPercent: bushaMarkup.buyMarkupPercent,
      sellMarkupPercent: bushaMarkup.sellMarkupPercent,
      obiexBuyMarkupPercent: obiexMarkup.buyMarkupPercent,
      obiexSellMarkupPercent: obiexMarkup.sellMarkupPercent,
      obiexBuyFlatFeeNgn: obiexFlat.buyFlatFeeNgn,
      obiexSellFlatFeeNgn: obiexFlat.sellFlatFeeNgn,
      billPaymentFeePercent: platform.billPaymentFeePercent,
      billPaymentFeeLabel: platform.billPaymentFeeLabel,
    },
    recentMarkupTrades: recent,
  };
}

export async function getProfitFeeSettings() {
  const [bushaMarkup, obiexMarkup, obiexFlat, platform] = await Promise.all([
    getBushaMarkupPercents(),
    getObiexMarkupPercents(),
    getObiexFlatFeesNgn(),
    getPlatformOperationSettings(),
  ]);
  return {
    buyMarkupPercent: bushaMarkup.buyMarkupPercent,
    sellMarkupPercent: bushaMarkup.sellMarkupPercent,
    obiexBuyMarkupPercent: obiexMarkup.buyMarkupPercent,
    obiexSellMarkupPercent: obiexMarkup.sellMarkupPercent,
    obiexBuyFlatFeeNgn: obiexFlat.buyFlatFeeNgn,
    obiexSellFlatFeeNgn: obiexFlat.sellFlatFeeNgn,
    billPaymentFeePercent: platform.billPaymentFeePercent,
    billPaymentFeeLabel: platform.billPaymentFeeLabel,
    note: 'Obiex flat buy/sell fees and % are edited on Rates. Bill payment fee is set here.',
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
