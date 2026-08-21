import { prisma } from '../../utils/prisma';
import { bushaClient } from './busha.client';
import { BUSHA_COMPLETED_STATUSES } from './busha.trade.service';
import { fiatWalletService } from '../fiat/fiat.wallet.service';

const bushaTradeLogModel = (prisma as any).bushaTradeLog;
const bushaCustomerModel = (prisma as any).bushaCustomer;

/**
 * After Busha transfer reaches a terminal success state:
 * - sell: credit user Terescrow NGN wallet from target_amount
 * - buy: mark fiat debit settled (already debited)
 * - receive/send: mark completed
 */
export async function settleBushaTradeIfNeeded(tradeId: string) {
  const trade = await bushaTradeLogModel.findUnique({ where: { id: tradeId } });
  if (!trade) return null;

  if (['wallet_credited', 'completed'].includes(trade.status) && trade.side !== 'sell') {
    return trade;
  }
  if (trade.status === 'wallet_credited') {
    return trade;
  }

  if (!trade.bushaTransferId) return trade;

  const customer = await bushaCustomerModel.findUnique({ where: { id: trade.customerId } });
  if (!customer) return trade;

  let remote: any = null;
  try {
    remote = await bushaClient.getTransfer(trade.bushaTransferId, customer.bushaProfileId);
  } catch {
    return trade;
  }

  const bushaStatus = remote.status;
  const isFailed =
    bushaStatus === 'failed' ||
    bushaStatus === 'cancelled' ||
    bushaStatus === 'funds_not_delivered' ||
    bushaStatus === 'funds_refunded';
  const isComplete =
    BUSHA_COMPLETED_STATUSES.has(bushaStatus) ||
    (trade.side === 'receive' && bushaStatus === 'funds_received') ||
    (trade.side === 'cryptoRecv' && bushaStatus === 'funds_received') ||
    (trade.side === 'buy' && bushaStatus === 'funds_received') ||
    (trade.side === 'convert' && (bushaStatus === 'funds_converted' || bushaStatus === 'completed'));

  if (isFailed) {
    if (trade.side === 'buy' && trade.userId && trade.fiatTransactionId && trade.status !== 'buy_reversed') {
      await reverseBuyIfNeeded(trade);
    }
    return bushaTradeLogModel.update({
      where: { id: tradeId },
      data: {
        bushaStatus,
        status: 'busha_failed',
        errorMessage: `Busha transfer ${bushaStatus}`,
        providerResponse: { ...(trade.providerResponse as object), transfer: remote },
        completedAt: new Date(),
      },
    });
  }

  if (!isComplete) {
    return bushaTradeLogModel.update({
      where: { id: tradeId },
      data: {
        bushaStatus,
        targetAmount: remote.target_amount || trade.targetAmount,
        providerResponse: { ...(trade.providerResponse as object), transfer: remote },
      },
    });
  }

  // Completed
  if (trade.side === 'sell' && trade.userId && trade.fiatTransactionId) {
    return creditSellToUserWallet(trade, remote);
  }

  if (trade.side === 'buy' && trade.fiatTransactionId) {
    await prisma.fiatTransaction.update({
      where: { id: trade.fiatTransactionId },
      data: { status: 'completed', completedAt: new Date() },
    }).catch(() => undefined);
  }

  return bushaTradeLogModel.update({
    where: { id: tradeId },
    data: {
      bushaStatus,
      targetAmount: remote.target_amount || trade.targetAmount,
      status: 'completed',
      completedAt: new Date(),
      providerResponse: { ...(trade.providerResponse as object), transfer: remote },
    },
  });
}

async function creditSellToUserWallet(trade: any, remote: any) {
  if (trade.status === 'wallet_credited') return trade;

  const bushaNgn = parseFloat(String(remote.target_amount || trade.targetAmount || '0'));
  const markup = (trade.providerResponse as any)?.markup;
  const storedUserCredit = parseFloat(String(markup?.userCreditNgn || ''));
  const sellMarkupPercent = parseFloat(String(markup?.sellMarkupPercent ?? '0')) || 0;

  let amountNgn = Number.isFinite(storedUserCredit) && storedUserCredit > 0
    ? storedUserCredit
    : bushaNgn;
  if (
    (!Number.isFinite(storedUserCredit) || storedUserCredit <= 0) &&
    sellMarkupPercent > 0 &&
    Number.isFinite(bushaNgn) &&
    bushaNgn > 0
  ) {
    amountNgn = Math.round(bushaNgn * (1 - sellMarkupPercent / 100) * 100) / 100;
  }

  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    return bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        bushaStatus: remote.status,
        status: 'completed',
        errorMessage: 'Busha completed but target_amount missing for wallet credit',
        completedAt: new Date(),
        providerResponse: { ...(trade.providerResponse as object), transfer: remote },
      },
    });
  }

  const fiatTxn = await prisma.fiatTransaction.findUnique({ where: { id: trade.fiatTransactionId } });
  if (!fiatTxn) {
    return bushaTradeLogModel.update({
      where: { id: trade.id },
      data: {
        bushaStatus: remote.status,
        status: 'completed',
        errorMessage: 'Missing fiat transaction for sell credit',
        completedAt: new Date(),
      },
    });
  }

  if (fiatTxn.status !== 'completed') {
    await prisma.fiatTransaction.update({
      where: { id: fiatTxn.id },
      data: {
        amount: amountNgn,
        totalAmount: amountNgn,
        fees: Number.isFinite(bushaNgn) ? Math.max(0, Math.round((bushaNgn - amountNgn) * 100) / 100) : fiatTxn.fees,
        status: 'pending',
      },
    });
    await fiatWalletService.creditWallet(
      fiatTxn.walletId,
      amountNgn,
      fiatTxn.id,
      `Busha sell credit ${trade.sourceAmount} ${trade.sourceCurrency}`
    );
  }

  return bushaTradeLogModel.update({
    where: { id: trade.id },
    data: {
      bushaStatus: remote.status,
      targetAmount: String(remote.target_amount || bushaNgn),
      status: 'wallet_credited',
      completedAt: new Date(),
      providerResponse: {
        ...(trade.providerResponse as object),
        transfer: remote,
        walletCredited: true,
        userCreditNgn: amountNgn,
      },
    },
  });
}

async function reverseBuyIfNeeded(trade: any) {
  const fiatTxn = await prisma.fiatTransaction.findUnique({ where: { id: trade.fiatTransactionId } });
  if (!fiatTxn || fiatTxn.status === 'failed') {
    await bushaTradeLogModel.update({
      where: { id: trade.id },
      data: { status: 'buy_reversed' },
    });
    return;
  }

  // Original debit already completed — create refund credit
  const { v4: uuidv4 } = await import('uuid');
  const wallet = await fiatWalletService.getOrCreateWallet(trade.userId, 'NGN');
  const amountNgn = parseFloat(String(fiatTxn.amount));
  const refundTxn = await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId: trade.userId,
      walletId: wallet.id,
      type: 'CRYPTO_BUY_REFUND',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: `Refund Busha buy ${trade.id}`,
    },
  });
  await fiatWalletService.creditWallet(wallet.id, amountNgn, refundTxn.id);
  await prisma.fiatTransaction.update({
    where: { id: fiatTxn.id },
    data: { status: 'failed' },
  });
  await bushaTradeLogModel.update({
    where: { id: trade.id },
    data: { status: 'buy_reversed' },
  });
}

/** Poll open app trades that need settlement. */
export async function pollOpenBushaSettlements(limit = 25) {
  const open = await bushaTradeLogModel.findMany({
    where: {
      userId: { not: null },
      status: { in: ['settling', 'awaiting_busha', 'awaiting_crypto_deposit', 'awaiting_palmpay'] },
      bushaTransferId: { not: null },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  const results = [];
  for (const trade of open) {
    try {
      results.push(await settleBushaTradeIfNeeded(trade.id));
    } catch (error: any) {
      console.error(`[Busha settlement] trade ${trade.id}:`, error?.message || error);
    }
  }
  return results;
}
