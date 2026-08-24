import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { getReferralSignupRules } from './referral.signup.rules';

async function loadReferralWithdrawContext(
  userId: number,
  amount: Decimal | number | string
) {
  const withdrawAmount = amount instanceof Decimal ? amount : new Decimal(amount || 0);

  if (withdrawAmount.lte(0)) {
    throw ApiError.badRequest('Withdrawal amount must be greater than 0');
  }

  const wallet = await prisma.referralWallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    throw ApiError.badRequest('No referral wallet found');
  }

  if (new Decimal(wallet.balance.toString()).lt(withdrawAmount)) {
    throw ApiError.badRequest('Insufficient referral wallet balance');
  }

  if (!wallet.hasWithdrawn) {
    const { minFirstWithdrawal: minAmount } = await getReferralSignupRules();
    if (new Decimal(wallet.balance.toString()).lt(minAmount)) {
      throw ApiError.badRequest(
        `First withdrawal requires a minimum balance of ₦${minAmount.toString()}`
      );
    }
  }

  const fiatWallet = await prisma.fiatWallet.findFirst({
    where: { userId, currency: 'NGN' },
  });

  if (!fiatWallet) {
    throw ApiError.badRequest('No NGN fiat wallet found');
  }

  return { wallet, fiatWallet, withdrawAmount };
}

/** Validate referral wallet can fund this withdrawal (no debit). */
export async function assertReferralWithdrawAvailable(
  userId: number,
  amount: Decimal | number | string
): Promise<void> {
  await loadReferralWithdrawContext(userId, amount);
}

/**
 * Move NGN from the user's referral wallet into their main fiat wallet.
 * Used by direct referral withdraw and by bank payouts with walletSource=referral.
 */
export async function transferReferralToFiatWallet(
  userId: number,
  amount: Decimal | number | string
): Promise<{ referralWalletId: number; fiatWalletId: string; amount: Decimal }> {
  const { wallet, fiatWallet, withdrawAmount } = await loadReferralWithdrawContext(
    userId,
    amount
  );

  await prisma.$transaction(async (tx) => {
    await tx.referralWallet.update({
      where: { id: wallet.id },
      data: {
        balance: { decrement: withdrawAmount },
        hasWithdrawn: true,
      },
    });

    await tx.fiatWallet.update({
      where: { id: fiatWallet.id },
      data: { balance: { increment: withdrawAmount } },
    });

    await tx.referralWithdrawal.create({
      data: {
        walletId: wallet.id,
        userId,
        amount: withdrawAmount,
        fiatWalletId: fiatWallet.id,
        status: 'completed',
      },
    });
  });

  return {
    referralWalletId: wallet.id,
    fiatWalletId: fiatWallet.id,
    amount: withdrawAmount,
  };
}
