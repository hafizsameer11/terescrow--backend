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
  feePercent: number | null;
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

function clampFeePercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(100, value);
}

async function loadConfigRow() {
  let row = await prisma.cryptoDepositFeeConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    row = await prisma.cryptoDepositFeeConfig.create({
      data: {
        id: CONFIG_ID,
        feePercent: 0,
        isActive: true,
        applyToAllCurrencies: false,
        walletCurrencyIds: [],
      },
    });
  }
  return row;
}

export async function listDepositFeeWalletCurrencyOptions(): Promise<DepositFeeWalletCurrencyOption[]> {
  const [rows, rules] = await Promise.all([
    prisma.walletCurrency.findMany({
      orderBy: [{ blockchain: 'asc' }, { isToken: 'asc' }, { currency: 'asc' }],
    }),
    prisma.cryptoDepositFeeRule.findMany(),
  ]);

  const feeByCurrencyId = new Map(rules.map((r) => [r.walletCurrencyId, Number(r.feePercent.toString())]));

  return rows.map((wc) => ({
    id: wc.id,
    currency: wc.currency,
    blockchain: wc.blockchain,
    symbol: wc.symbol || wc.currency,
    displayLabel: formatCurrencyLabel(wc.currency, wc.blockchain, wc.isToken),
    isToken: wc.isToken,
    feePercent: feeByCurrencyId.has(wc.id) ? feeByCurrencyId.get(wc.id)! : null,
  }));
}

/** @deprecated Use getCryptoDepositFeePercentForWalletCurrency */
export async function getCryptoDepositFeePercent(): Promise<Decimal> {
  return getCryptoDepositFeePercentForWalletCurrency(undefined);
}

export async function getCryptoDepositFeePercentForWalletCurrency(
  walletCurrencyId: number | null | undefined
): Promise<Decimal> {
  const config = await loadConfigRow();
  if (!config.isActive || walletCurrencyId == null) return new Decimal(0);

  const rule = await prisma.cryptoDepositFeeRule.findUnique({
    where: { walletCurrencyId },
  });
  if (!rule) return new Decimal(0);

  const pct = new Decimal(rule.feePercent.toString());
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
  const currencies = await listDepositFeeWalletCurrencyOptions();
  const configuredRules = currencies
    .filter((c) => c.feePercent != null && c.feePercent > 0)
    .map((c) => ({
      walletCurrencyId: c.id,
      feePercent: c.feePercent as number,
      displayLabel: c.displayLabel,
    }));

  return {
    isActive: row.isActive,
    currencies,
    configuredRules,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type DepositFeeRuleInput = {
  walletCurrencyId: number;
  feePercent: number;
};

export async function updateCryptoDepositFeeConfig(input: {
  isActive?: boolean;
  rules?: DepositFeeRuleInput[];
  updatedByUserId?: number;
}) {
  if (!Array.isArray(input.rules)) {
    throw new Error('rules array is required');
  }

  const normalizedRules: DepositFeeRuleInput[] = [];
  const seen = new Set<number>();

  for (const raw of input.rules) {
    const walletCurrencyId = Number(raw.walletCurrencyId);
    const feePercent = clampFeePercent(Number(raw.feePercent));
    if (!Number.isInteger(walletCurrencyId) || walletCurrencyId <= 0) continue;
    if (seen.has(walletCurrencyId)) continue;
    seen.add(walletCurrencyId);
    if (feePercent <= 0) continue;
    normalizedRules.push({ walletCurrencyId, feePercent });
  }

  await prisma.$transaction(async (tx) => {
    await tx.cryptoDepositFeeConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        feePercent: 0,
        isActive: input.isActive ?? true,
        applyToAllCurrencies: false,
        walletCurrencyIds: [],
        updatedByUserId: input.updatedByUserId ?? null,
      },
      update: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        feePercent: 0,
        applyToAllCurrencies: false,
        walletCurrencyIds: [],
        updatedByUserId: input.updatedByUserId ?? null,
      },
    });

    await tx.cryptoDepositFeeRule.deleteMany({});

    if (normalizedRules.length > 0) {
      await tx.cryptoDepositFeeRule.createMany({
        data: normalizedRules.map((r) => ({
          walletCurrencyId: r.walletCurrencyId,
          feePercent: r.feePercent,
        })),
      });
    }
  });

  return getCryptoDepositFeeConfig();
}
