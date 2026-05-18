import { ReferralService } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/** Canonical row for signup bonus and first-withdrawal minimum (matches admin earn settings). */
export const REFERRAL_SIGNUP_RULES_SERVICE = ReferralService.CRYPTO_BUY;

export const DEFAULT_SIGNUP_BONUS_NGN = 10000;
export const DEFAULT_MIN_FIRST_WITHDRAWAL_NGN = 20000;

export async function getReferralSignupRules() {
  const row = await prisma.referralCommissionSetting.findUnique({
    where: { service: REFERRAL_SIGNUP_RULES_SERVICE },
    select: { signupBonus: true, minFirstWithdrawal: true },
  });

  return {
    signupBonusNgn: row ? Number(row.signupBonus) : DEFAULT_SIGNUP_BONUS_NGN,
    minFirstWithdrawalNgn: row
      ? Number(row.minFirstWithdrawal)
      : DEFAULT_MIN_FIRST_WITHDRAWAL_NGN,
    signupBonus: row
      ? new Decimal(row.signupBonus.toString())
      : new Decimal(String(DEFAULT_SIGNUP_BONUS_NGN)),
    minFirstWithdrawal: row
      ? new Decimal(row.minFirstWithdrawal.toString())
      : new Decimal(String(DEFAULT_MIN_FIRST_WITHDRAWAL_NGN)),
  };
}
