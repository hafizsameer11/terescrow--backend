import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { normalizeBlockchain } from './received.asset.disbursement.helpers';
import {
  sendReceivedAssetToMasterWallet,
  sendReceivedAssetToVendor,
} from './received.asset.disbursement.service';

export type DepositSweepTarget = 'master' | 'vendor';

export interface DepositSweepPreviewItem {
  receiveTransactionId: string;
  customerName: string;
  amount: string;
  amountUsd: string;
  txHash: string;
  depositAddress: string;
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

const receiveSweepInclude = {
  cryptoReceive: true,
  user: { select: { firstname: true, lastname: true } },
  virtualAccount: {
    include: {
      depositAddresses: { take: 1, orderBy: { createdAt: 'desc' as const } },
      walletCurrency: { select: { currency: true } },
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
    const txCur = normalizeCurrency(tx.currency);
    if (txCur === cur) return true;
    const wcCur = tx.virtualAccount?.walletCurrency?.currency
      ? normalizeCurrency(tx.virtualAccount.walletCurrency.currency)
      : '';
    return wcCur === cur;
  });
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
      items: [],
      dryRun: true,
    };
  }

  const first = rows[0];

  let totalAmount = new Decimal(0);
  let totalAmountUsd = new Decimal(0);
  const items: DepositSweepPreviewItem[] = rows.map((tx) => {
    const recv = tx.cryptoReceive!;
    const amt = new Decimal(recv.amount.toString());
    const amtUsd = new Decimal(recv.amountUsd.toString());
    totalAmount = totalAmount.plus(amt);
    totalAmountUsd = totalAmountUsd.plus(amtUsd);
    const deposit = tx.virtualAccount?.depositAddresses?.[0]?.address || recv.toAddress;
    return {
      receiveTransactionId: tx.transactionId,
      customerName: tx.user ? `${tx.user.firstname} ${tx.user.lastname}`.trim() : '',
      amount: recv.amount.toString(),
      amountUsd: recv.amountUsd.toString(),
      txHash: recv.txHash,
      depositAddress: deposit || '',
    };
  });

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
