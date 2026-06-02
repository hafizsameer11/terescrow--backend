import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import ApiError from '../../utils/ApiError';
import { extractBaseSymbol, normalizeBlockchain } from './received.asset.disbursement.helpers';
import {
  sendReceivedAssetToMasterWallet,
  sendReceivedAssetToVendor,
} from './received.asset.disbursement.service';
import { fetchOnChainTokenBalance } from '../crypto/onchain.balance.service';

export type DepositSweepTarget = 'master' | 'vendor';

export interface DepositSweepPreviewItem {
  receiveTransactionId: string;
  customerName: string;
  amount: string;
  amountUsd: string;
  txHash: string;
  depositAddress: string;
  /** Live on-chain balance at deposit address (Tron USDT via TronScan). */
  onChainAmount?: string | null;
}

export interface DepositSweepPreview {
  currency: string;
  blockchain: string;
  destinationType: DepositSweepTarget;
  vendorId: number | null;
  destinationAddress: string;
  destinationLabel: string;
  itemCount: number;
  totalAmount: string;
  totalAmountUsd: string;
  /** Sum of unique deposit-address on-chain balances (what is physically on chain). */
  totalOnChainAmount?: string | null;
  items: DepositSweepPreviewItem[];
  dryRun: boolean;
}

export interface DepositSweepExecuteResult {
  batchId: string;
  performedByUserId: number;
  performedByRole: string;
  preview: DepositSweepPreview;
  results: Array<{
    receiveTransactionId: string;
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
  summary: { total: number; succeeded: number; failed: number };
}

function normalizeCurrency(c: string): string {
  return String(c || '').trim().toUpperCase();
}

function sweepCurrencyMatches(filterCurrency: string, txCurrency: string, wcCurrency?: string | null): boolean {
  const base = extractBaseSymbol(filterCurrency);
  if (extractBaseSymbol(txCurrency) === base) return true;
  if (wcCurrency && extractBaseSymbol(wcCurrency) === base) return true;
  return false;
}

const receiveSweepInclude = {
  cryptoReceive: true,
  user: { select: { firstname: true, lastname: true } },
  virtualAccount: {
    include: {
      depositAddresses: { take: 1, orderBy: { createdAt: 'desc' as const } },
      walletCurrency: {
        select: {
          currency: true,
          contractAddress: true,
          decimals: true,
          isToken: true,
        },
      },
    },
  },
} satisfies Prisma.CryptoTransactionInclude;

type ReceiveSweepRow = Prisma.CryptoTransactionGetPayload<{ include: typeof receiveSweepInclude }>;

async function findSweepableReceives(currency: string, blockchain?: string): Promise<ReceiveSweepRow[]> {
  const cur = normalizeCurrency(currency);
  const chainFilter = blockchain?.trim() ? normalizeBlockchain(blockchain) : undefined;

  const receives = await prisma.cryptoTransaction.findMany({
    where: {
      transactionType: 'RECEIVE',
      status: 'successful',
      cryptoReceive: { isNot: null },
      ...(chainFilter ? { blockchain: chainFilter } : {}),
    },
    include: receiveSweepInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const hashes = receives.map((r) => r.cryptoReceive?.txHash).filter((h): h is string => !!h);
  const assets = hashes.length
    ? await prisma.receivedAsset.findMany({
        where: { txId: { in: hashes }, status: 'inWallet' },
        select: { txId: true },
      })
    : [];
  const inWalletHashes = new Set(assets.map((a) => a.txId));

  return receives.filter((tx) => {
    const recv = tx.cryptoReceive;
    if (!recv || !inWalletHashes.has(recv.txHash)) return false;
    const wcCur = tx.virtualAccount?.walletCurrency?.currency ?? '';
    return sweepCurrencyMatches(cur, tx.currency, wcCur);
  });
}

async function fetchDepositOnChainAmount(tx: ReceiveSweepRow): Promise<string | null> {
  const recv = tx.cryptoReceive;
  if (!recv) return null;
  const deposit = tx.virtualAccount?.depositAddresses?.[0]?.address || recv.toAddress;
  if (!deposit) return null;

  const wc = tx.virtualAccount?.walletCurrency;
  const chainNorm = normalizeBlockchain(tx.blockchain).toLowerCase();
  const isTronToken =
    (chainNorm === 'tron' || chainNorm === 'trx') &&
    (extractBaseSymbol(tx.currency) === 'USDT' ||
      (wc?.currency ? extractBaseSymbol(wc.currency) === 'USDT' : false) ||
      wc?.isToken === true);

  if (!isTronToken && wc?.isToken !== true) return null;

  try {
    const balance = await fetchOnChainTokenBalance({
      blockchain: tx.blockchain,
      address: deposit,
      contractAddress: wc?.contractAddress ?? (isTronToken ? 'USDT_TRON' : null),
      decimals: wc?.decimals ?? 6,
      isToken: wc?.isToken ?? isTronToken,
    });
    return formatCryptoAmount(balance);
  } catch {
    return null;
  }
}

async function resolveSweepDestination(input: {
  target: DepositSweepTarget;
  vendorId?: number;
  chainNorm: string;
}): Promise<{ address: string; label: string; vendorId: number | null }> {
  if (input.target === 'vendor') {
    const vendorId = input.vendorId;
    if (!vendorId) throw ApiError.badRequest('vendorId is required when destination is vendor');
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw ApiError.notFound('Vendor not found');
    const address = vendor.walletAddress?.trim() || '';
    if (!address) throw ApiError.badRequest('Vendor has no wallet address');
    return { address, label: `Vendor: ${vendor.name}`, vendorId };
  }
  const masterWallet = await prisma.masterWallet.findUnique({ where: { blockchain: input.chainNorm } });
  const address = masterWallet?.address?.trim() || '';
  if (!address) {
    throw ApiError.badRequest(`Master wallet address is not configured for "${input.chainNorm}"`);
  }
  return { address, label: `Master wallet (${input.chainNorm})`, vendorId: null };
}

export async function getDepositSweepPreview(input: {
  currency: string;
  blockchain?: string;
  target?: DepositSweepTarget;
  vendorId?: number;
}): Promise<DepositSweepPreview> {
  const currency = normalizeCurrency(input.currency);
  if (!currency) throw ApiError.badRequest('currency is required');
  const target: DepositSweepTarget = input.target === 'vendor' ? 'vendor' : 'master';

  const rows = await findSweepableReceives(currency, input.blockchain);
  const chainNorm = rows.length
    ? normalizeBlockchain(rows[0].blockchain)
    : input.blockchain
      ? normalizeBlockchain(input.blockchain)
      : 'ethereum';

  const dest = await resolveSweepDestination({
    target,
    vendorId: input.vendorId,
    chainNorm,
  });

  if (rows.length === 0) {
    return {
      currency,
      blockchain: input.blockchain || chainNorm,
      destinationType: target,
      vendorId: dest.vendorId,
      destinationAddress: dest.address,
      destinationLabel: dest.label,
      itemCount: 0,
      totalAmount: '0',
      totalAmountUsd: '0',
      totalOnChainAmount: '0',
      items: [],
      dryRun: true,
    };
  }

  const first = rows[0];

  const items: DepositSweepPreviewItem[] = await Promise.all(
    rows.map(async (tx) => {
      const recv = tx.cryptoReceive!;
      const deposit = tx.virtualAccount?.depositAddresses?.[0]?.address || recv.toAddress;
      const onChainAmount = await fetchDepositOnChainAmount(tx);
      return {
        receiveTransactionId: tx.transactionId,
        customerName: tx.user ? `${tx.user.firstname} ${tx.user.lastname}`.trim() : '',
        amount: formatCryptoAmount(recv.amount),
        amountUsd: recv.amountUsd.toString(),
        txHash: recv.txHash,
        depositAddress: deposit || '',
        onChainAmount,
      };
    })
  );

  let totalAmount = new Decimal(0);
  let totalAmountUsd = new Decimal(0);
  const onChainByAddress = new Map<string, Decimal>();
  for (const item of items) {
    totalAmount = totalAmount.plus(item.amount);
    totalAmountUsd = totalAmountUsd.plus(item.amountUsd);
    const deposit = item.depositAddress?.trim().toLowerCase();
    if (deposit && item.onChainAmount != null && !onChainByAddress.has(deposit)) {
      onChainByAddress.set(deposit, new Decimal(item.onChainAmount));
    }
  }

  let totalOnChainAmount: string | null = null;
  if (onChainByAddress.size > 0) {
    let sum = new Decimal(0);
    for (const v of onChainByAddress.values()) sum = sum.plus(v);
    totalOnChainAmount = sum.toString();
  }

  return {
    currency,
    blockchain: first.blockchain,
    destinationType: target,
    vendorId: dest.vendorId,
    destinationAddress: dest.address,
    destinationLabel: dest.label,
    itemCount: items.length,
    totalAmount: totalAmount.toString(),
    totalAmountUsd: totalAmountUsd.toString(),
    totalOnChainAmount,
    items,
    dryRun: true,
  };
}

export async function executeDepositSweep(input: {
  currency: string;
  blockchain?: string;
  target?: DepositSweepTarget;
  vendorId?: number;
  dryRun?: boolean;
  performedByUserId: number;
  performedByRole: string;
}): Promise<DepositSweepExecuteResult> {
  const target: DepositSweepTarget = input.target === 'vendor' ? 'vendor' : 'master';
  const preview = await getDepositSweepPreview({
    currency: input.currency,
    blockchain: input.blockchain,
    target,
    vendorId: input.vendorId,
  });

  const batchId = `sweep-${Date.now()}-${input.performedByUserId}`;

  if (input.dryRun || preview.itemCount === 0) {
    return {
      batchId,
      performedByUserId: input.performedByUserId,
      performedByRole: input.performedByRole,
      preview,
      results: [],
      summary: { total: 0, succeeded: 0, failed: 0 },
    };
  }

  const results: DepositSweepExecuteResult['results'] = [];

  for (const item of preview.items) {
    try {
      const data =
        target === 'vendor' && preview.vendorId
          ? await sendReceivedAssetToVendor({
              receiveTransactionId: item.receiveTransactionId,
              adminUserId: input.performedByUserId,
              vendorId: preview.vendorId,
            })
          : await sendReceivedAssetToMasterWallet({
              receiveTransactionId: item.receiveTransactionId,
              adminUserId: input.performedByUserId,
            });
      results.push({
        receiveTransactionId: item.receiveTransactionId,
        success: true,
        txHash: data.txHash,
      });
    } catch (e: unknown) {
      results.push({
        receiveTransactionId: item.receiveTransactionId,
        success: false,
        error: e instanceof Error ? e.message : 'Sweep failed',
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return {
    batchId,
    performedByUserId: input.performedByUserId,
    performedByRole: input.performedByRole,
    preview,
    results,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
  };
}
