import { prisma } from '../../utils/prisma';
import tatumService from '../tatum/tatum.service';

export interface BalanceSummaryItem {
  walletId: string;
  label: string;
  totalUsd: number;
  totalNgn: number;
  totalBtc?: number;
  accountName?: string;
  accountNumber?: string;
}

export interface AssetItem {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number;
  address?: string;
  blockchain?: string;
  tercescrowBalance?: string;
  tercescrowUsd?: number;
}

export interface MasterWalletTxItem {
  id: number;
  to: string | null;
  status: string;
  type: string;
  wallet: string;
  amount: string;
  date: string;
  assetSymbol: string;
  walletId: string;
}

export async function getMasterWalletBalanceSummary(): Promise<BalanceSummaryItem[]> {
  const [wallets, currencies] = await Promise.all([
    prisma.masterWallet.findMany(),
    prisma.walletCurrency.findMany({ where: { isToken: false } }),
  ]);
  let totalUsd = 0;
  let totalNgn = 0;
  let totalBtc = 0;

  for (const w of wallets) {
    if (!w.address) continue;
    const wc = currencies.find((c) => c.blockchain === w.blockchain);
    const usdPrice = wc?.price ? Number(wc.price) : 0;
    const nairaPrice = wc?.nairaPrice ? Number(wc.nairaPrice) : 0;
    try {
      const balance = await tatumService.getAddressBalance(w.blockchain, w.address, false);
      if (balance?.balance !== undefined) {
        const bal = parseFloat(String(balance.balance));
        totalUsd += bal * usdPrice;
        totalNgn += bal * nairaPrice;
        if (w.blockchain?.toLowerCase() === 'bitcoin') totalBtc += bal;
      }
    } catch (_) {
      // skip
    }
  }

  return [
    {
      walletId: 'tercescrow',
      label: 'Tercescrow',
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalNgn: Math.round(totalNgn * 100) / 100,
      totalBtc: totalBtc > 0 ? Math.round(totalBtc * 1e8) / 1e8 : undefined,
    },
    {
      walletId: 'yellowcard',
      label: 'Yellow Card',
      totalUsd: 0,
      totalNgn: 0,
    },
    {
      walletId: 'palmpay',
      label: 'Palmpay',
      totalUsd: 0,
      totalNgn: 0,
      accountName: undefined,
      accountNumber: undefined,
    },
  ];
}

export async function getMasterWalletAssets(walletId?: string): Promise<AssetItem[]> {
  if (walletId && walletId !== 'tercescrow') {
    return [];
  }
  const wallets = await prisma.masterWallet.findMany();
  const currencies = await prisma.walletCurrency.findMany();
  const assets: Map<string, AssetItem> = new Map();

  for (const w of wallets) {
    if (!w.address) continue;
    const key = `${w.blockchain}-native`;
    let balance = '0';
    let usdVal = 0;
    try {
      const bal = await tatumService.getAddressBalance(w.blockchain, w.address, false);
      if (bal?.balance) {
        balance = String(bal.balance);
        const wc = currencies.find((c) => c.blockchain === w.blockchain && !c.isToken);
        const price = wc?.price ? Number(wc.price) : 0;
        usdVal = parseFloat(balance) * price;
      }
    } catch (_) {}
    const wc = currencies.find((c) => c.blockchain === w.blockchain && !c.isToken);
    const symbol = wc?.symbol ?? w.blockchain?.toUpperCase().slice(0, 3) ?? 'NAT';
    const name = wc?.name ?? w.blockchain ?? '';

    if (!assets.has(key)) {
      assets.set(key, {
        symbol,
        name,
        balance: '0',
        usdValue: 0,
        address: w.address,
        blockchain: w.blockchain,
        tercescrowBalance: balance,
        tercescrowUsd: Math.round(usdVal * 100) / 100,
      });
    } else {
      const existing = assets.get(key)!;
      existing.tercescrowBalance = (parseFloat(existing.tercescrowBalance || '0') + parseFloat(balance)).toString();
      existing.tercescrowUsd = (existing.tercescrowUsd ?? 0) + Math.round(usdVal * 100) / 100;
    }
  }

  for (const a of assets.values()) {
    a.balance = a.tercescrowBalance ?? '0';
    a.usdValue = a.tercescrowUsd ?? 0;
  }
  return Array.from(assets.values());
}

export async function getMasterWalletTransactions(
  assetSymbol?: string,
  walletId?: string
): Promise<MasterWalletTxItem[]> {
  const where: any = {};
  if (walletId) where.walletId = walletId;
  if (assetSymbol) where.assetSymbol = assetSymbol;
  const rows = await prisma.masterWalletTransaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    to: r.toAddress,
    status: r.status,
    type: r.type,
    wallet: r.walletId,
    amount: r.amount.toString(),
    date: r.createdAt.toISOString(),
    assetSymbol: r.assetSymbol,
    walletId: r.walletId,
  }));
}

export async function createMasterWalletSend(params: {
  address: string;
  amountCrypto?: string;
  amountDollar?: string;
  network: string;
  symbol: string;
  vendorId?: number;
}): Promise<{ success: boolean; txId?: number; error?: string }> {
  const amount = params.amountCrypto ?? '0';
  const walletId = 'tercescrow';
  const record = await prisma.masterWalletTransaction.create({
    data: {
      walletId,
      type: 'send',
      assetSymbol: params.symbol,
      amount,
      toAddress: params.address,
      status: 'pending',
    },
  });
  return { success: true, txId: record.id };
}

export async function createMasterWalletSwap(params: {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  receivingWallet?: string;
}): Promise<{ success: boolean; txId?: number; error?: string }> {
  const walletId = 'tercescrow';
  const record = await prisma.masterWalletTransaction.create({
    data: {
      walletId,
      type: 'swap',
      assetSymbol: params.fromSymbol,
      amount: params.fromAmount,
      status: 'pending',
    },
  });
  return { success: true, txId: record.id };
}
