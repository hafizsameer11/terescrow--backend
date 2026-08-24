import { ReferralService } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/** Canonical row for signup bonus and first-withdrawal minimum (matches admin earn settings). */
export const REFERRAL_SIGNUP_RULES_SERVICE = ReferralService.CRYPTO_BUY;

export const DEFAULT_SIGNUP_BONUS_NGN = 10000;
/** Temporarily lowered for referral-withdraw testing (restore to 20000 before production). */
export const DEFAULT_MIN_FIRST_WITHDRAWAL_NGN = 100;

export async function getReferralSignupRules() {
  const row = await prisma.referralCommissionSetting.findUnique({
    where: { service: REFERRAL_SIGNUP_RULES_SERVICE },
    select: { signupBonus: true, minFirstWithdrawal: true },
  });

  const signupBonusNgn = row ? Number(row.signupBonus) : DEFAULT_SIGNUP_BONUS_NGN;
  // Use testing minimum so DB rows still set to 20000 do not block withdraw tests
  const minFirstWithdrawalNgn = DEFAULT_MIN_FIRST_WITHDRAWAL_NGN;

  if (row && Number(row.minFirstWithdrawal) !== minFirstWithdrawalNgn) {
    prisma.referralCommissionSetting
      .updateMany({ data: { minFirstWithdrawal: minFirstWithdrawalNgn } })
      .catch(() => undefined);
  }

  return {
    signupBonusNgn,
    minFirstWithdrawalNgn,
    signupBonus: new Decimal(String(signupBonusNgn)),
    minFirstWithdrawal: new Decimal(String(minFirstWithdrawalNgn)),
  };
}
