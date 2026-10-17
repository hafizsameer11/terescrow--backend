import { prisma } from '../../utils/prisma';

const mapModel = () => (prisma as any).obiexCurrencyMap;

const DEFAULT_MAP: Array<{
  appCurrency: string;
  obiexCurrency: string;
  displayName: string;
  sortOrder: number;
}> = [
  { appCurrency: 'USDT', obiexCurrency: 'USDT', displayName: 'Tether', sortOrder: 10 },
  { appCurrency: 'USDC', obiexCurrency: 'USDC', displayName: 'USD Coin', sortOrder: 20 },
  { appCurrency: 'BTC', obiexCurrency: 'BTC', displayName: 'Bitcoin', sortOrder: 30 },
  { appCurrency: 'ETH', obiexCurrency: 'ETH', displayName: 'Ethereum', sortOrder: 40 },
  { appCurrency: 'BNB', obiexCurrency: 'BNB', displayName: 'BNB', sortOrder: 50 },
  { appCurrency: 'SOL', obiexCurrency: 'SOL', displayName: 'Solana', sortOrder: 60 },
  { appCurrency: 'TRX', obiexCurrency: 'TRX', displayName: 'TRON', sortOrder: 70 },
  { appCurrency: 'DOGE', obiexCurrency: 'DOGE', displayName: 'Dogecoin', sortOrder: 80 },
  { appCurrency: 'XRP', obiexCurrency: 'XRP', displayName: 'XRP', sortOrder: 90 },
  { appCurrency: 'TON', obiexCurrency: 'TON', displayName: 'Toncoin', sortOrder: 100 },
  { appCurrency: 'MATIC', obiexCurrency: 'MATIC', displayName: 'Polygon', sortOrder: 110 },
  { appCurrency: 'AVAX', obiexCurrency: 'AVAX', displayName: 'Avalanche', sortOrder: 120 },
  { appCurrency: 'LTC', obiexCurrency: 'LTC', displayName: 'Litecoin', sortOrder: 130 },
  { appCurrency: 'ADA', obiexCurrency: 'ADA', displayName: 'Cardano', sortOrder: 140 },
  { appCurrency: 'DOT', obiexCurrency: 'DOT', displayName: 'Polkadot', sortOrder: 150 },
  { appCurrency: 'LINK', obiexCurrency: 'LINK', displayName: 'Chainlink', sortOrder: 160 },
  { appCurrency: 'SHIB', obiexCurrency: 'SHIB', displayName: 'Shiba Inu', sortOrder: 170 },
];

export async function ensureObiexCurrencyMapSeeded() {
  const count = await mapModel().count();
  if (count > 0) return;
  const now = new Date();
  await mapModel().createMany({
    data: DEFAULT_MAP.map((row) => ({
      ...row,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })),
    skipDuplicates: true,
  });
}

export async function listActiveObiexCurrencyMaps() {
  await ensureObiexCurrencyMapSeeded();
  return mapModel().findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { appCurrency: 'asc' }],
  });
}

/** App/Busha display code → Obiex ledger code. */
export async function resolveObiexLedgerCurrency(appCurrency: string): Promise<string> {
  const code = String(appCurrency || '')
    .trim()
    .toUpperCase()
    .replace(/^USDT_.*/, 'USDT')
    .replace(/^USDC_.*/, 'USDC');
  if (!code) return code;
  await ensureObiexCurrencyMapSeeded();
  const row = await mapModel().findUnique({ where: { appCurrency: code } });
  if (row?.obiexCurrency) return String(row.obiexCurrency).toUpperCase();
  const byObiex = await mapModel().findFirst({
    where: { obiexCurrency: code, isActive: true },
  });
  if (byObiex?.obiexCurrency) return String(byObiex.obiexCurrency).toUpperCase();
  return code;
}

/** Obiex ledger code → preferred app display code. */
export async function resolveAppCurrencyFromObiex(obiexCurrency: string): Promise<string> {
  const code = String(obiexCurrency || '').trim().toUpperCase();
  if (!code) return code;
  await ensureObiexCurrencyMapSeeded();
  const exact = await mapModel().findFirst({
    where: { obiexCurrency: code, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (exact?.appCurrency) return String(exact.appCurrency).toUpperCase();
  return code;
}
