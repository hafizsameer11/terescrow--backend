import { prisma } from '../../utils/prisma';
import profitLedgerService from './profit.ledger.service';

/** VTpass / StroWallet-style commission on bill provider payloads. */
export function extractBillProviderCommission(providerResponse: unknown): {
  commissionNgn: number;
  rate: string | null;
  rateType: string | null;
  productName: string | null;
  totalAmountNgn: number | null;
} {
  const root = parseJson(providerResponse);
  const tx =
    dig(root, ['response', 'content', 'transactions']) ||
    dig(root, ['content', 'transactions']) ||
    dig(root, ['data', 'content', 'transactions']) ||
    null;

  const details = tx && typeof tx === 'object' ? (tx as any).commission_details : null;
  const raw =
    tx != null && typeof tx === 'object' && (tx as any).commission != null
      ? Number((tx as any).commission)
      : details?.amount != null
        ? Number(details.amount)
        : NaN;

  const commissionNgn = Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : 0;
  const totalRaw = tx != null && typeof tx === 'object' ? Number((tx as any).total_amount) : NaN;

  return {
    commissionNgn,
    rate: details?.rate != null ? String(details.rate) : null,
    rateType: details?.rate_type != null ? String(details.rate_type) : null,
    productName:
      tx != null && typeof tx === 'object' && (tx as any).product_name
        ? String((tx as any).product_name)
        : null,
    totalAmountNgn: Number.isFinite(totalRaw) ? Math.round(totalRaw * 100) / 100 : null,
  };
}

function parseJson(raw: unknown): any {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function dig(obj: any, path: string[]): any {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[key];
  }
  return cur;
}

function merchantFeeFromMeta(providerResponse: unknown, fiatFees?: number | null): number {
  const root = parseJson(providerResponse);
  const feeNgn = Number(root?.merchantFee?.feeNgn);
  if (Number.isFinite(feeNgn) && feeNgn > 0) return Math.round(feeNgn * 100) / 100;
  const fromFiat = Number(fiatFees);
  if (Number.isFinite(fromFiat) && fromFiat > 0) return Math.round(fromFiat * 100) / 100;
  return 0;
}

/**
 * Write/update admin profit_ledger for a completed bill:
 * platform profit = merchant markup fee + provider (Strowallet/VTpass) commission.
 */
export async function recordBillPaymentPlatformProfit(opts: {
  fiatTransactionId: string;
  billPaymentId?: string | null;
  amountNgn: number;
  billType?: string | null;
  provider?: string | null;
  providerResponse: unknown;
  merchantFeeNgn?: number | null;
  asOf?: Date | null;
}): Promise<{ profitNgn: number; commissionNgn: number; merchantFeeNgn: number } | null> {
  if (process.env.PROFIT_TRACKER_WRITE_ENABLED === 'false') return null;

  const extracted = extractBillProviderCommission(opts.providerResponse);
  const merchantFeeNgn =
    opts.merchantFeeNgn != null && Number.isFinite(Number(opts.merchantFeeNgn))
      ? Math.max(0, Math.round(Number(opts.merchantFeeNgn) * 100) / 100)
      : merchantFeeFromMeta(opts.providerResponse);
  const commissionNgn = extracted.commissionNgn;
  const profitNgn = Math.round((merchantFeeNgn + commissionNgn) * 100) / 100;

  if (!(profitNgn > 0)) return { profitNgn: 0, commissionNgn, merchantFeeNgn };

  const amount = Number(opts.amountNgn);
  const service = (opts.billType || 'bill_payment').toLowerCase();
  const notesParts = [
    commissionNgn > 0
      ? `Provider commission ₦${commissionNgn}${
          extracted.rate ? ` (${extracted.rate}${extracted.rateType === 'percent' ? '%' : ''})` : ''
        }`
      : null,
    merchantFeeNgn > 0 ? `Merchant fee ₦${merchantFeeNgn}` : null,
    extracted.productName ? extracted.productName : null,
    opts.provider ? `via ${opts.provider}` : null,
  ].filter(Boolean);

  const meta = {
    source: 'profit.bill.commission.service',
    billPaymentId: opts.billPaymentId || null,
    provider: opts.provider || null,
    merchantFeeNgn,
    providerCommissionNgn: commissionNgn,
    commissionRate: extracted.rate,
    commissionRateType: extracted.rateType,
    productName: extracted.productName,
    providerTotalAmountNgn: extracted.totalAmountNgn,
  };

  await profitLedgerService.upsertForced({
    sourceTransactionType: 'FIAT_TRANSACTION',
    sourceTransactionId: opts.fiatTransactionId,
    transactionType: 'BILL_PAYMENTS',
    asset: 'NGN',
    service,
    amount: Number.isFinite(amount) ? amount : profitNgn,
    amountNgn: Number.isFinite(amount) ? amount : profitNgn,
    asOf: opts.asOf || new Date(),
    notes: notesParts.join(' · ') || 'Bill payment platform profit',
    meta,
    forcedProfit: {
      profitType: 'FIXED',
      profitValue: profitNgn,
      profitNgn,
      notes: notesParts.join(' · ') || 'Bill payment platform profit',
    },
    // Also refresh legacy BILL_PAYMENT event keys created by fiat backfill
    alternateEventKeys: [
      `FIAT_TRANSACTION:${opts.fiatTransactionId}:BILL_PAYMENT`,
    ],
  });

  return { profitNgn, commissionNgn, merchantFeeNgn };
}

/** Backfill profit_ledger from completed BillPayment rows that already store commission. */
export async function backfillBillProviderCommissionProfit(opts?: {
  limit?: number;
  dryRun?: boolean;
  provider?: string;
}): Promise<{ scanned: number; updated: number; skipped: number; totalProfitNgn: number; dryRun: boolean }> {
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000);
  const dryRun = !!opts?.dryRun;
  const where: any = { status: 'completed' };
  if (opts?.provider) where.provider = opts.provider;

  const rows = await prisma.billPayment.findMany({
    where,
    orderBy: { completedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      transactionId: true,
      provider: true,
      billType: true,
      amount: true,
      providerResponse: true,
      completedAt: true,
      createdAt: true,
    },
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let totalProfitNgn = 0;

  for (const row of rows) {
    scanned += 1;
    if (!row.transactionId) {
      skipped += 1;
      continue;
    }
    const extracted = extractBillProviderCommission(row.providerResponse);
    const merchantFeeNgn = merchantFeeFromMeta(row.providerResponse);
    const profitNgn = Math.round((extracted.commissionNgn + merchantFeeNgn) * 100) / 100;
    if (!(profitNgn > 0)) {
      skipped += 1;
      continue;
    }
    totalProfitNgn += profitNgn;
    if (dryRun) {
      updated += 1;
      continue;
    }
    await recordBillPaymentPlatformProfit({
      fiatTransactionId: row.transactionId,
      billPaymentId: row.id,
      amountNgn: Number(row.amount),
      billType: row.billType,
      provider: row.provider,
      providerResponse: row.providerResponse,
      merchantFeeNgn,
      asOf: row.completedAt || row.createdAt,
    });
    updated += 1;
  }

  return {
    scanned,
    updated,
    skipped,
    totalProfitNgn: Math.round(totalProfitNgn * 100) / 100,
    dryRun,
  };
}
