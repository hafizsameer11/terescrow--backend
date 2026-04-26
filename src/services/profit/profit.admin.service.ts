import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import profitEngineService from './profit.engine.service';

function toDecimal(value: any, field: string): Decimal {
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) throw new Error('not finite');
    return d;
  } catch {
    throw ApiError.badRequest(`${field} must be a valid number`);
  }
}

class ProfitAdminService {
  async listConfigs() {
    const [profitConfigs, rateConfigs, discountTiers] = await Promise.all([
      prisma.profitConfig.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.rateConfig.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.discountTier.findMany({ orderBy: [{ precedence: 'desc' }, { minAmount: 'asc' }] }),
    ]);
    return { profitConfigs, rateConfigs, discountTiers };
  }

  async createProfitConfig(input: any, adminUserId?: number) {
    const transactionType = String(input.transactionType || '').toUpperCase().trim();
    if (!transactionType) throw ApiError.badRequest('transactionType is required');
    const scope = String(input.scope || 'GLOBAL').toUpperCase().trim();
    const profitType = String(input.profitType || '').toUpperCase().trim();
    if (!['FIXED', 'PERCENTAGE', 'SPREAD'].includes(profitType)) {
      throw ApiError.badRequest('profitType must be FIXED, PERCENTAGE or SPREAD');
    }
    if (!['GLOBAL', 'ASSET', 'SERVICE'].includes(scope)) {
      throw ApiError.badRequest('scope must be GLOBAL, ASSET or SERVICE');
    }

    return prisma.profitConfig.create({
      data: {
        transactionType,
        scope: scope as any,
        asset: input.asset ? String(input.asset).toUpperCase().trim() : null,
        service: input.service ? String(input.service).toLowerCase().trim() : null,
        profitType: profitType as any,
        value: toDecimal(input.value, 'value'),
        isActive: input.isActive !== false,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        createdBy: adminUserId || null,
      },
    });
  }

  async updateProfitConfig(id: number, input: any) {
    const payload: any = {};
    if (input.scope) payload.scope = String(input.scope).toUpperCase().trim();
    if (input.asset !== undefined) payload.asset = input.asset ? String(input.asset).toUpperCase().trim() : null;
    if (input.service !== undefined) payload.service = input.service ? String(input.service).toLowerCase().trim() : null;
    if (input.profitType) payload.profitType = String(input.profitType).toUpperCase().trim();
    if (input.value !== undefined) payload.value = toDecimal(input.value, 'value');
    if (input.isActive !== undefined) payload.isActive = !!input.isActive;
    if (input.effectiveFrom !== undefined) payload.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (input.effectiveTo !== undefined) payload.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    return prisma.profitConfig.update({ where: { id }, data: payload });
  }

  async createRateConfig(input: any, adminUserId?: number) {
    const asset = String(input.asset || '').toUpperCase().trim();
    if (!asset) throw ApiError.badRequest('asset is required');
    return prisma.rateConfig.create({
      data: {
        asset,
        blockchain: input.blockchain ? String(input.blockchain).toLowerCase().trim() : null,
        baseBuyRate: toDecimal(input.baseBuyRate, 'baseBuyRate'),
        baseSellRate: toDecimal(input.baseSellRate, 'baseSellRate'),
        isActive: input.isActive !== false,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        createdBy: adminUserId || null,
      },
    });
  }

  async updateRateConfig(id: number, input: any) {
    const payload: any = {};
    if (input.asset !== undefined) payload.asset = String(input.asset).toUpperCase().trim();
    if (input.blockchain !== undefined) payload.blockchain = input.blockchain ? String(input.blockchain).toLowerCase().trim() : null;
    if (input.baseBuyRate !== undefined) payload.baseBuyRate = toDecimal(input.baseBuyRate, 'baseBuyRate');
    if (input.baseSellRate !== undefined) payload.baseSellRate = toDecimal(input.baseSellRate, 'baseSellRate');
    if (input.isActive !== undefined) payload.isActive = !!input.isActive;
    if (input.effectiveFrom !== undefined) payload.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (input.effectiveTo !== undefined) payload.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    return prisma.rateConfig.update({ where: { id }, data: payload });
  }

  async createDiscountTier(input: any, adminUserId?: number) {
    return prisma.discountTier.create({
      data: {
        asset: input.asset ? String(input.asset).toUpperCase().trim() : null,
        transactionType: input.transactionType ? String(input.transactionType).toUpperCase().trim() : null,
        minAmount: toDecimal(input.minAmount, 'minAmount'),
        maxAmount: input.maxAmount != null ? toDecimal(input.maxAmount, 'maxAmount') : null,
        discountPercentage: toDecimal(input.discountPercentage, 'discountPercentage'),
        precedence: input.precedence != null ? Number(input.precedence) : 0,
        isActive: input.isActive !== false,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        createdBy: adminUserId || null,
      },
    });
  }

  async updateDiscountTier(id: number, input: any) {
    const payload: any = {};
    if (input.asset !== undefined) payload.asset = input.asset ? String(input.asset).toUpperCase().trim() : null;
    if (input.transactionType !== undefined) payload.transactionType = input.transactionType ? String(input.transactionType).toUpperCase().trim() : null;
    if (input.minAmount !== undefined) payload.minAmount = toDecimal(input.minAmount, 'minAmount');
    if (input.maxAmount !== undefined) payload.maxAmount = input.maxAmount != null ? toDecimal(input.maxAmount, 'maxAmount') : null;
    if (input.discountPercentage !== undefined) payload.discountPercentage = toDecimal(input.discountPercentage, 'discountPercentage');
    if (input.precedence !== undefined) payload.precedence = Number(input.precedence);
    if (input.isActive !== undefined) payload.isActive = !!input.isActive;
    if (input.effectiveFrom !== undefined) payload.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (input.effectiveTo !== undefined) payload.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    return prisma.discountTier.update({ where: { id }, data: payload });
  }

  async preview(input: any) {
    return profitEngineService.compute({
      transactionType: String(input.transactionType || '').toUpperCase().trim(),
      asset: input.asset ? String(input.asset).toUpperCase().trim() : null,
      blockchain: input.blockchain ? String(input.blockchain).toLowerCase().trim() : null,
      service: input.service ? String(input.service).toLowerCase().trim() : null,
      amount: input.amount,
      amountUsd: input.amountUsd ?? null,
      amountNgn: input.amountNgn ?? null,
      buyRate: input.buyRate ?? null,
      sellRate: input.sellRate ?? null,
    });
  }
}

export default new ProfitAdminService();
