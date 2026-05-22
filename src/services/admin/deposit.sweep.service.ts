import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { normalizeBlockchain } from './received.asset.disbursement.helpers';
import { sendReceivedAssetToMasterWallet } from './received.asset.disbursement.service';

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

async function findSweepableReceives(currency: string, blockchain?: string) {
  const cur = normalizeCurrency(currency);
  const chainFilter = blockchain?.trim() ? normalizeBlockchain(blockchain) : undefined;

  const receives = await prisma.cryptoTransaction.findMany({
    where: {
      transactionType: 'RECEIVE',
      status: 'successful',
      cryptoReceive: { isNot: null },
      ...(chainFilter ? { blockchain: { contains: chainFilter, mode: 'insensitive' } } : {}),
    },
    include: {
      cryptoReceive: true,
      user: { select: { firstname: true, lastname: true } },
      virtualAccount: {
        include: {
          depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const hashes = receives.map((r) => r.cryptoReceive!.txHash).filter(Boolean);
  const assets = hashes.length
    ? await prisma.receivedAsset.findMany({
        where: { txId: { in: hashes }, status: 'inWallet' },
        select: { txId: true },
      })
    : [];
  const inWalletHashes = new Set(assets.map((a) => a.txId));

  return receives.filter((tx) => {
    const recv = tx.cryptoReceive!;
    if (!inWalletHashes.has(recv.txHash)) return false;
    const txCur = normalizeCurrency(tx.currency);
    if (txCur !== cur && !txCur.includes(cur) && !cur.includes(txCur)) {
      const wc = tx.virtualAccount?.walletCurrency;
      const wcCur = wc?.currency ? normalizeCurrency(wc.currency) : '';
      if (wcCur !== cur) return false;
    }
    return true;
  });
}

export async function getDepositSweepPreview(input: {
  currency: string;
  blockchain?: string;
}): Promise<DepositSweepPreview> {
  const currency = normalizeCurrency(input.currency);
  if (!currency) throw ApiError.badRequest('currency is required');

  const rows = await findSweepableReceives(currency, input.blockchain);
  if (rows.length === 0) {
    const chainNorm = input.blockchain ? normalizeBlockchain(input.blockchain) : 'ethereum';
    const mw = await prisma.masterWallet.findFirst({
      where: { blockchain: chainNorm },
    });
    return {
      currency,
      blockchain: input.blockchain || chainNorm,
      destinationAddress: mw?.address || '',
      destinationLabel: `Master wallet (${chainNorm})`,
      itemCount: 0,
      totalAmount: '0',
      totalAmountUsd: '0',
      items: [],
      dryRun: true,
    };
  }

  const first = rows[0];
  const chainNorm = normalizeBlockchain(first.blockchain);
  const masterWallet = await prisma.masterWallet.findUnique({ where: { blockchain: chainNorm } });
  const destinationAddress = masterWallet?.address?.trim() || '';
  if (!destinationAddress) {
    throw ApiError.badRequest(`Master wallet address is not configured for "${chainNorm}"`);
  }

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
    destinationAddress,
    destinationLabel: `Master wallet (${chainNorm})`,
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
  dryRun?: boolean;
  performedByUserId: number;
  performedByRole: string;
}): Promise<DepositSweepExecuteResult> {
  const preview = await getDepositSweepPreview({
    currency: input.currency,
    blockchain: input.blockchain,
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
      const data = await sendReceivedAssetToMasterWallet({
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
