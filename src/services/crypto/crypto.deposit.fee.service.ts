import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';

export type CryptoDepositFeeBreakdown = {
  feePercent: Decimal;
  grossCrypto: Decimal;
  grossUsd: Decimal;
  feeCrypto: Decimal;
  feeUsd: Decimal;
  creditedCrypto: Decimal;
  creditedUsd: Decimal;
  feeNgn: Decimal | null;
};

export type DepositFeeWalletCurrencyOption = {
  id: number;
  currency: string;
  blockchain: string;
  symbol: string;
  displayLabel: string;
  isToken: boolean;
};

const CONFIG_ID = 1;

function formatCurrencyLabel(currency: string, blockchain: string, isToken: boolean): string {
  const chain = String(blockchain ?? '').trim();
  const chainLabel =
    chain.length <= 4 ? chain.toUpperCase() : chain.charAt(0).toUpperCase() + chain.slice(1).toLowerCase();
  let c = String(currency ?? '').trim().toUpperCase();
  const m = c.match(/^(USDT|USDC|DAI|BUSD|BTC|ETH|BNB|TRX|SOL|LTC|DOGE|MATIC)_(.+)$/);
  if (m) c = m[1];
  if (!c) return chainLabel || '—';
  if (!chain) return c;
  if (isToken) {
    const standard =
      chain.toLowerCase() === 'tron' || chain.toLowerCase() === 'trx'
        ? 'TRC20'
        : chain.toLowerCase() === 'ethereum' || chain.toLowerCase() === 'eth'
          ? 'ERC20'
          : chain.toLowerCase() === 'bsc'
            ? 'BEP20'
            : 'Token';
    return `${c} ${standard} (${chainLabel})`;
  }
  return `${c} (${chainLabel})`;
}

function parseWalletCurrencyIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isInteger(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)];
}

async function loadConfigRow() {
  let row = await prisma.cryptoDepositFeeConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    row = await prisma.cryptoDepositFeeConfig.create({
      data: {
        id: CONFIG_ID,
        feePercent: 0,
        isActive: true,
        applyToAllCurrencies: true,
        walletCurrencyIds: [],
      },
    });
  }
  return row;
}

function feeAppliesToWalletCurrency(
  row: { applyToAllCurrencies: boolean; walletCurrencyIds: unknown },
  walletCurrencyId: number | null | undefined
): boolean {
  if (row.applyToAllCurrencies) return true;
  const ids = parseWalletCurrencyIds(row.walletCurrencyIds);
  if (ids.length === 0) return false;
  if (walletCurrencyId == null) return false;
  return ids.includes(walletCurrencyId);
}

export async function listDepositFeeWalletCurrencyOptions(): Promise<DepositFeeWalletCurrencyOption[]> {
  const rows = await prisma.walletCurrency.findMany({
    orderBy: [{ blockchain: 'asc' }, { isToken: 'asc' }, { currency: 'asc' }],
  });
  return rows.map((wc) => ({
    id: wc.id,
    currency: wc.currency,
    blockchain: wc.blockchain,
    symbol: wc.symbol || wc.currency,
    displayLabel: formatCurrencyLabel(wc.currency, wc.blockchain, wc.isToken),
    isToken: wc.isToken,
  }));
}

/** @deprecated Use getCryptoDepositFeePercentForWalletCurrency */
export async function getCryptoDepositFeePercent(): Promise<Decimal> {
  return getCryptoDepositFeePercentForWalletCurrency(undefined);
}

export async function getCryptoDepositFeePercentForWalletCurrency(
  walletCurrencyId: number | null | undefined
): Promise<Decimal> {
  const row = await loadConfigRow();
  if (!row.isActive) return new Decimal(0);
  if (!feeAppliesToWalletCurrency(row, walletCurrencyId)) return new Decimal(0);

  const pct = new Decimal(row.feePercent.toString());
  if (!pct.isFinite() || pct.lte(0)) return new Decimal(0);
  return Decimal.min(pct, new Decimal(100));
}

export function computeCryptoDepositFee(params: {
  grossCrypto: Decimal;
  grossUsd: Decimal;
  feePercent: Decimal;
  usdToNgnRate?: Decimal | null;
}): CryptoDepositFeeBreakdown {
  const grossCrypto = params.grossCrypto;
  const grossUsd = params.grossUsd;
  const feePercent = params.feePercent.lte(0) ? new Decimal(0) : params.feePercent;

  const feeCrypto = grossCrypto.mul(feePercent).div(100);
  const feeUsd = grossUsd.mul(feePercent).div(100);
  const creditedCrypto = grossCrypto.minus(feeCrypto);
  const creditedUsd = grossUsd.minus(feeUsd);

  let feeNgn: Decimal | null = null;
  if (params.usdToNgnRate && params.usdToNgnRate.gt(0)) {
    feeNgn = feeUsd.mul(params.usdToNgnRate);
  }

  return {
    feePercent,
    grossCrypto,
    grossUsd,
    feeCrypto,
    feeUsd,
    creditedCrypto,
    creditedUsd,
    feeNgn,
  };
}

export async function getCryptoDepositFeeConfig() {
  const row = await loadConfigRow();
  const walletCurrencyIds = parseWalletCurrencyIds(row.walletCurrencyIds);
  const availableCurrencies = await listDepositFeeWalletCurrencyOptions();

  return {
    feePercent: Number(row.feePercent.toString()),
    isActive: row.isActive,
    applyToAllCurrencies: row.applyToAllCurrencies,
    walletCurrencyIds,
    availableCurrencies,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateCryptoDepositFeeConfig(input: {
  feePercent: number;
  isActive?: boolean;
  applyToAllCurrencies?: boolean;
  walletCurrencyIds?: number[];
  updatedByUserId?: number;
}) {
  const pct = Number(input.feePercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('Fee percent must be between 0 and 100');
  }

  const applyToAll = input.applyToAllCurrencies ?? true;
  let walletCurrencyIds = parseWalletCurrencyIds(input.walletCurrencyIds ?? []);

  if (!applyToAll && walletCurrencyIds.length === 0) {
    throw new Error('Select at least one wallet currency, or enable apply to all currencies');
  }

  const row = await prisma.cryptoDepositFeeConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      feePercent: pct,
      isActive: input.isActive ?? true,
      applyToAllCurrencies: applyToAll,
      walletCurrencyIds: applyToAll ? [] : walletCurrencyIds,
      updatedByUserId: input.updatedByUserId ?? null,
    },
    update: {
      feePercent: pct,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      applyToAllCurrencies: applyToAll,
      walletCurrencyIds: applyToAll ? [] : walletCurrencyIds,
      updatedByUserId: input.updatedByUserId ?? null,
    },
  });

  const savedIds = parseWalletCurrencyIds(row.walletCurrencyIds);

  return {
    feePercent: Number(row.feePercent.toString()),
    isActive: row.isActive,
    applyToAllCurrencies: row.applyToAllCurrencies,
    walletCurrencyIds: savedIds,
    availableCurrencies: await listDepositFeeWalletCurrencyOptions(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
