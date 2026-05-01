import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import { calculateFixedProfit, calculatePercentageProfit, calculateSpreadProfit } from './profit.math';

export type ProfitComputationInput = {
  transactionType: string;
  asset?: string | null;
  blockchain?: string | null;
  service?: string | null;
  amount: string | number | Decimal;
  amountUsd?: string | number | Decimal | null;
  amountNgn?: string | number | Decimal | null;
  buyRate?: string | number | Decimal | null;
  sellRate?: string | number | Decimal | null;
  /** Use the source transaction time when backfilling; defaults to request time when omitted. */
  asOf?: Date;
};

export type ProfitComputationResult = {
  transactionType: string;
  asset?: string | null;
  blockchain?: string | null;
  service?: string | null;
  amount: Decimal;
  amountUsd?: Decimal | null;
  amountNgn?: Decimal | null;
  buyRate?: Decimal | null;
  sellRate?: Decimal | null;
  discountPercentage?: Decimal | null;
  profitType: 'FIXED' | 'PERCENTAGE' | 'SPREAD';
  profitValue: Decimal;
  profitNgn: Decimal;
  configId?: number;
  rateConfigId?: number;
  discountTierId?: number;
  notes?: string;
};

function d(v: string | number | Decimal | null | undefined): Decimal | null {
  if (v === null || v === undefined) return null;
  return new Decimal(v);
}

class ProfitEngineService {
  private now() {
    return new Date();
  }

  async resolveProfitConfig(params: {
    transactionType: string;
    asset?: string | null;
    service?: string | null;
    asOf?: Date;
  }) {
    const now = params.asOf ?? this.now();
    const txType = params.transactionType.toUpperCase().trim();
    const asset = params.asset?.toUpperCase().trim();
    const service = params.service?.toLowerCase().trim();

    if (asset) {
      const assetCfg = await prisma.profitConfig.findFirst({
        where: {
          transactionType: txType,
          scope: 'ASSET',
          asset,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      });
      if (assetCfg) return assetCfg;
    }

    if (service) {
      const serviceCfg = await prisma.profitConfig.findFirst({
        where: {
          transactionType: txType,
          scope: 'SERVICE',
          service,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      });
      if (serviceCfg) return serviceCfg;
    }

    return prisma.profitConfig.findFirst({
      where: {
        transactionType: txType,
        scope: 'GLOBAL',
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
  }

  async resolveRateConfig(params: { asset?: string | null; blockchain?: string | null; asOf?: Date }) {
    if (!params.asset) return null;
    const now = params.asOf ?? this.now();
    const asset = params.asset.toUpperCase().trim();
    const blockchain = params.blockchain?.toLowerCase().trim();
    if (blockchain) {
      const exact = await prisma.rateConfig.findFirst({
        where: {
          asset,
          blockchain,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      });
      if (exact) return exact;
    }
    return prisma.rateConfig.findFirst({
      where: {
        asset,
        blockchain: null,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
  }

  async resolveDiscountTier(params: {
    transactionType?: string | null;
    asset?: string | null;
    amountUsd?: Decimal | null;
    asOf?: Date;
  }) {
    if (!params.amountUsd || params.amountUsd.lte(0)) return null;
    const now = params.asOf ?? this.now();
    const amountUsd = params.amountUsd;
    const txType = params.transactionType?.toUpperCase().trim();
    const asset = params.asset?.toUpperCase().trim();

    const tiers = await prisma.discountTier.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        minAmount: { lte: amountUsd.toString() },
        ...(asset ? { OR: [{ asset }, { asset: null }] } : {}),
        ...(txType ? { AND: [{ OR: [{ transactionType: txType }, { transactionType: null }] }] } : {}),
      },
      orderBy: [{ precedence: 'desc' }, { minAmount: 'desc' }, { id: 'desc' }],
    });

    return tiers.find((tier) => !tier.maxAmount || new Decimal(tier.maxAmount).gte(amountUsd)) || null;
  }

  async compute(input: ProfitComputationInput): Promise<ProfitComputationResult> {
    const amount = new Decimal(input.amount);
    if (!amount.isFinite() || amount.lte(0)) throw new Error('Amount must be positive');

    const amountUsd = d(input.amountUsd);
    const amountNgn = d(input.amountNgn);
    const buyRateIn = d(input.buyRate);
    const sellRateIn = d(input.sellRate);

    const asOf = input.asOf;

    const [cfg, rateCfg, tier] = await Promise.all([
      this.resolveProfitConfig({
        transactionType: input.transactionType,
        asset: input.asset,
        service: input.service,
        asOf,
      }),
      this.resolveRateConfig({ asset: input.asset, blockchain: input.blockchain, asOf }),
      this.resolveDiscountTier({
        transactionType: input.transactionType,
        asset: input.asset,
        amountUsd,
        asOf,
      }),
    ]);

    const buyRate = buyRateIn ?? (rateCfg ? new Decimal(rateCfg.baseBuyRate.toString()) : null);
    const sellRateBase = sellRateIn ?? (rateCfg ? new Decimal(rateCfg.baseSellRate.toString()) : null);
    const discountPercentage = tier ? new Decimal(tier.discountPercentage.toString()) : null;
    const sellRate = sellRateBase
      ? discountPercentage
        ? sellRateBase.minus(sellRateBase.mul(discountPercentage.div(100)))
        : sellRateBase
      : null;

    let profitType: 'FIXED' | 'PERCENTAGE' | 'SPREAD' = 'FIXED';
    let profitValue = new Decimal(0);
    let profitNgn = new Decimal(0);
    let notes = 'No active profit config found; zero-profit fallback.';

    if (cfg) {
      if (cfg.profitType === 'SPREAD') {
        profitType = 'SPREAD';
        if (!buyRate || !sellRate) {
          throw new Error('Spread profit requires buy and sell rates');
        }
        const spread = calculateSpreadProfit(amount, buyRate, sellRate);
        profitValue = spread.profitValue;
        profitNgn = spread.profitNgn;
      } else if (cfg.profitType === 'PERCENTAGE') {
        profitType = 'PERCENTAGE';
        const percentage = new Decimal(cfg.value.toString());
        const base = amountNgn ?? amountUsd ?? amount;
        const pct = calculatePercentageProfit(base, percentage);
        profitValue = pct.profitValue;
        profitNgn = pct.profitNgn;
      } else {
        profitType = 'FIXED';
        const fixed = new Decimal(cfg.value.toString());
        const fx = calculateFixedProfit(fixed);
        profitValue = fx.profitValue;
        profitNgn = fx.profitNgn;
      }
      notes = `Computed from config ${cfg.id}.`;
    } else if (buyRate && sellRate) {
      // Useful default for crypto where rates exist even if explicit config not yet seeded.
      profitType = 'SPREAD';
      const spread = calculateSpreadProfit(amount, buyRate, sellRate);
      profitValue = spread.profitValue;
      profitNgn = spread.profitNgn;
      notes = 'Computed from spread fallback (rate config) with no explicit profit config.';
    }

    return {
      transactionType: input.transactionType.toUpperCase().trim(),
      asset: input.asset?.toUpperCase().trim(),
      blockchain: input.blockchain?.toLowerCase().trim(),
      service: input.service?.toLowerCase().trim(),
      amount,
      amountUsd,
      amountNgn,
      buyRate,
      sellRate,
      discountPercentage,
      profitType,
      profitValue,
      profitNgn,
      configId: cfg?.id,
      rateConfigId: rateCfg?.id,
      discountTierId: tier?.id,
      notes,
    };
  }
}

export default new ProfitEngineService();
