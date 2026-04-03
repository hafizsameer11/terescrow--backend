/**
 * NGN wallet charge for gift card purchase using crypto_rates tiers (transactionType GIFT_CARD_BUY).
 * USD notional = unitPrice * quantity for USD-denominated Reloadly products.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoRateService from '../crypto/crypto.rate.service';
import { fiatWalletService } from '../fiat/fiat.wallet.service';

export async function refundGiftCardWalletDebit(input: {
  userId: number;
  walletId: string;
  amountNgn: number;
  originalFiatTxId: string;
  errorMessage: string;
}) {
  const { userId, walletId, amountNgn, originalFiatTxId, errorMessage } = input;
  const currentWallet = await prisma.fiatWallet.findUnique({ where: { id: walletId } });
  if (!currentWallet) {
    console.error('[GiftCard] Refund skipped: wallet not found', walletId);
    return;
  }
  const refundBalance = new Decimal(currentWallet.balance).plus(amountNgn);
  await prisma.fiatWallet.update({
    where: { id: walletId },
    data: { balance: refundBalance },
  });
  await prisma.fiatTransaction.create({
    data: {
      id: uuidv4(),
      userId,
      walletId,
      type: 'GIFT_CARD_BUY_REFUND',
      status: 'completed',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: 'Refund for failed gift card purchase',
      metadata: JSON.stringify({
        refundFor: originalFiatTxId,
        error: errorMessage,
      }),
    },
  });
  await prisma.fiatTransaction.update({
    where: { id: originalFiatTxId },
    data: {
      status: 'failed',
      errorMessage: errorMessage.slice(0, 500),
    },
  });
}

/**
 * Debit user's NGN wallet for a USD-denominated gift card order (face value * qty).
 * Returns fiat transaction id and amounts for persistence on GiftCardOrder.
 */
export async function debitWalletForGiftCardPurchase(input: {
  userId: number;
  unitPrice: number;
  quantity: number;
  productCurrencyCode: string;
  productName?: string;
}): Promise<{
  fiatTransactionId: string;
  walletId: string;
  amountNgn: number;
  usdNotional: number;
  ngnPerUsd: string;
  rateTierId: number;
}> {
  const cur = (input.productCurrencyCode || 'USD').trim().toUpperCase();
  if (cur !== 'USD') {
    throw ApiError.badRequest(
      `Wallet billing supports USD-priced gift cards only (this product is ${cur}).`
    );
  }

  const usdNotional = input.unitPrice * input.quantity;
  if (!Number.isFinite(usdNotional) || usdNotional <= 0) {
    throw ApiError.badRequest('Invalid order amount');
  }

  const rateRow = await cryptoRateService.getRateForAmount('GIFT_CARD_BUY', usdNotional);
  if (!rateRow) {
    throw ApiError.badRequest(
      'Gift card NGN rate is not configured for this order size. Ask admin to add GIFT_CARD_BUY tiers under /api/admin/crypto/rates.'
    );
  }

  const ngnCharge = new Decimal(usdNotional)
    .mul(rateRow.rate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const amountNgn = parseFloat(ngnCharge.toFixed(2));

  const wallet = await fiatWalletService.getOrCreateWallet(input.userId, 'NGN');
  const balance = parseFloat(wallet.balance.toString());
  if (balance < amountNgn) {
    throw ApiError.badRequest(
      `Insufficient NGN balance. Required ${amountNgn} NGN (≈ $${usdNotional.toFixed(2)} face value at current gift card rate).`
    );
  }

  const fiatTxId = uuidv4();
  await prisma.fiatTransaction.create({
    data: {
      id: fiatTxId,
      userId: input.userId,
      walletId: wallet.id,
      type: 'GIFT_CARD_BUY',
      status: 'pending',
      currency: 'NGN',
      amount: amountNgn,
      fees: 0,
      totalAmount: amountNgn,
      description: `Gift card purchase${input.productName ? `: ${input.productName}` : ''}`,
      metadata: JSON.stringify({
        usdNotional,
        ngnPerUsd: rateRow.rate.toString(),
        rateTierId: rateRow.id,
        productCurrency: cur,
      }),
    },
  });

  await fiatWalletService.debitWallet(
    wallet.id,
    amountNgn,
    fiatTxId,
    `Gift card purchase${input.productName ? `: ${input.productName}` : ''}`
  );

  return {
    fiatTransactionId: fiatTxId,
    walletId: wallet.id,
    amountNgn,
    usdNotional,
    ngnPerUsd: rateRow.rate.toString(),
    rateTierId: rateRow.id,
  };
}
