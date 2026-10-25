import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { obiexConfig } from './obiex.config';
import { obiexClient } from './obiex.client';
import {
  getObiexConfigRow,
  listObiexMarkupRanges,
  parseFlatFeeNgn,
  parseSignedPercent,
} from './obiex.markup';

const configModel = () => (prisma as any).obiexConfig;
const rangeModel = () => (prisma as any).obiexMarkupRange;

export async function getObiexAdminStatus() {
  const settings = await getObiexConfigRow();
  let masterBalances: any[] = [];
  if (obiexConfig.isConfigured()) {
    try {
      for (const code of ['NGNX', 'USDT', 'USDC']) {
        try {
          const res = await obiexClient.getWalletBalance(code);
          masterBalances.push({ currency: code, ...(res?.data || res) });
        } catch {
          // currency may not exist on account
        }
      }
    } catch {
      // ignore
    }
  }
  return {
    ...obiexConfig.getConfigForAdmin(),
    settings: {
      isActive: !!settings.isActive,
      buyMode: settings.buyMode,
      buyMarkupPercent: Number(settings.buyMarkupPercent),
      sellMarkupPercent: Number(settings.sellMarkupPercent),
      buyFlatFeeNgn: parseFlatFeeNgn(settings.buyFlatFeeNgn),
      sellFlatFeeNgn: parseFlatFeeNgn(settings.sellFlatFeeNgn),
      collectionsTarget: settings.collectionsTarget,
    },
    masterBalances,
  };
}

export async function upsertObiexSettings(input: {
  isActive?: boolean;
  buyMode?: string;
  buyMarkupPercent?: number | string;
  sellMarkupPercent?: number | string;
  buyFlatFeeNgn?: number | string;
  sellFlatFeeNgn?: number | string;
  collectionsTarget?: string;
}) {
  const buyMode =
    input.buyMode === 'collections_va' || input.buyMode === 'master_swap'
      ? input.buyMode
      : undefined;
  const collectionsTarget =
    input.collectionsTarget === 'USDC' || input.collectionsTarget === 'USDT'
      ? input.collectionsTarget
      : undefined;

  return configModel().upsert({
    where: { id: 1 },
    create: {
      id: 1,
      isActive: input.isActive ?? false,
      buyMode: buyMode || 'master_swap',
      buyMarkupPercent: parseSignedPercent(input.buyMarkupPercent ?? 0),
      sellMarkupPercent: Math.abs(parseSignedPercent(input.sellMarkupPercent ?? 0)),
      buyFlatFeeNgn: parseFlatFeeNgn(input.buyFlatFeeNgn ?? 0),
      sellFlatFeeNgn: parseFlatFeeNgn(input.sellFlatFeeNgn ?? 0),
      collectionsTarget: collectionsTarget || 'USDT',
    },
    update: {
      ...(input.isActive !== undefined ? { isActive: !!input.isActive } : {}),
      ...(buyMode ? { buyMode } : {}),
      ...(input.buyMarkupPercent !== undefined
        ? { buyMarkupPercent: parseSignedPercent(input.buyMarkupPercent) }
        : {}),
      ...(input.sellMarkupPercent !== undefined
        ? { sellMarkupPercent: Math.abs(parseSignedPercent(input.sellMarkupPercent)) }
        : {}),
      ...(input.buyFlatFeeNgn !== undefined
        ? { buyFlatFeeNgn: parseFlatFeeNgn(input.buyFlatFeeNgn) }
        : {}),
      ...(input.sellFlatFeeNgn !== undefined
        ? { sellFlatFeeNgn: parseFlatFeeNgn(input.sellFlatFeeNgn) }
        : {}),
      ...(collectionsTarget ? { collectionsTarget } : {}),
    },
  });
}

export async function getObiexMarkupRangesAdmin(side?: 'buy' | 'sell') {
  return listObiexMarkupRanges(side);
}

export async function upsertObiexMarkupRange(input: {
  id?: number;
  side: 'buy' | 'sell';
  minUsd: number | string;
  maxUsd: number | string;
  percent: number | string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  if (input.side !== 'buy' && input.side !== 'sell') {
    throw ApiError.badRequest('side must be buy or sell');
  }
  const data = {
    side: input.side,
    minUsd: parseFloat(String(input.minUsd)),
    maxUsd: parseFloat(String(input.maxUsd)),
    percent: parseSignedPercent(input.percent),
    isActive: input.isActive !== false,
    sortOrder: Number(input.sortOrder) || 0,
  };
  if (!Number.isFinite(data.minUsd) || !Number.isFinite(data.maxUsd) || data.maxUsd < data.minUsd) {
    throw ApiError.badRequest('Invalid USD range');
  }
  if (input.id) {
    return rangeModel().update({ where: { id: Number(input.id) }, data });
  }
  return rangeModel().create({ data });
}

export async function deleteObiexMarkupRange(id: number) {
  return rangeModel().delete({ where: { id } });
}

export {
  getTradeReconByTradeId,
  listMismatchedRecons,
} from './obiex.reconcile.service';

export { listActiveObiexCurrencyMaps, ensureObiexCurrencyMapSeeded } from './obiex.currency-map';
