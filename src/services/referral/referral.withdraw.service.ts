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

  const { minFirstWithdrawal: minAmount } = await getReferralSignupRules();

  if (withdrawAmount.lt(minAmount)) {
    throw ApiError.badRequest(
      `Referral withdrawal must be at least ₦${minAmount.toString()}`
    );
  }

  if (!wallet.hasWithdrawn) {
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

/** Emergency kill-switch: referral / signup-bonus cashouts disabled. */
export const REFERRAL_WITHDRAWALS_DISABLED = true;
export const REFERRAL_WITHDRAWALS_DISABLED_MESSAGE =
  'Referral wallet withdrawals are temporarily disabled. Please contact support.';

function assertReferralWithdrawalsEnabled(): void {
  if (REFERRAL_WITHDRAWALS_DISABLED) {
    throw ApiError.forbidden(REFERRAL_WITHDRAWALS_DISABLED_MESSAGE);
  }
}

/** Validate referral wallet can fund this withdrawal (no debit). */
export async function assertReferralWithdrawAvailable(
  userId: number,
  amount: Decimal | number | string
): Promise<void> {
  assertReferralWithdrawalsEnabled();
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
  assertReferralWithdrawalsEnabled();
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

/**
 * Undo transferReferralToFiatWallet after a failed bank payout.
 * Does NOT check the referral kill-switch (must work while cashouts are disabled).
 */
export async function reverseReferralToFiatTransfer(
  userId: number,
  amount: Decimal | number | string
): Promise<void> {
  const withdrawAmount = amount instanceof Decimal ? amount : new Decimal(amount || 0);
  if (withdrawAmount.lte(0)) return;

  const wallet = await prisma.referralWallet.findUnique({ where: { userId } });
  const fiatWallet = await prisma.fiatWallet.findFirst({
    where: { userId, currency: 'NGN' },
  });
  if (!wallet || !fiatWallet) {
    throw ApiError.badRequest('Cannot reverse referral transfer: wallet missing');
  }

  const fiatBal = new Decimal(fiatWallet.balance.toString());
  if (fiatBal.lt(withdrawAmount)) {
    throw ApiError.badRequest(
      `Cannot reverse referral transfer: fiat balance ₦${fiatBal.toString()} < ₦${withdrawAmount.toString()}`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.fiatWallet.update({
      where: { id: fiatWallet.id },
      data: { balance: { decrement: withdrawAmount } },
    });

    await tx.referralWallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: withdrawAmount } },
    });

    const latest = await tx.referralWithdrawal.findFirst({
      where: {
        userId,
        status: 'completed',
        amount: withdrawAmount,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      await tx.referralWithdrawal.update({
        where: { id: latest.id },
        data: { status: 'cancelled' },
      });
    }

    const remainingCompleted = await tx.referralWithdrawal.count({
      where: { userId, status: 'completed' },
    });
    if (remainingCompleted === 0) {
      await tx.referralWallet.update({
        where: { id: wallet.id },
        data: { hasWithdrawn: false },
      });
    }
  });
}
