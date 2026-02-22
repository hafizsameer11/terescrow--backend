import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ReferralService, ReferralCommissionType, ReferralEarningType } from '@prisma/client';

export { ReferralService } from '@prisma/client';

async function getOrCreateWallet(userId: number, tx: any) {
  let wallet = await tx.referralWallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.referralWallet.create({
      data: { userId, balance: 0 },
    });
  }
  return wallet;
}

async function getCommissionConfig(userId: number, service: ReferralService) {
  const override = await prisma.userReferralOverride.findUnique({
    where: { userId_service: { userId, service } },
  });

  if (override) {
    return {
      commissionType: override.commissionType,
      commissionValue: new Decimal(override.commissionValue.toString()),
    };
  }

  const global = await prisma.referralCommissionSetting.findUnique({
    where: { service },
  });

  if (!global || !global.isActive) return null;

  return {
    commissionType: global.commissionType,
    commissionValue: new Decimal(global.commissionValue.toString()),
  };
}

async function getLevel2Pct(service: ReferralService): Promise<Decimal> {
  const global = await prisma.referralCommissionSetting.findUnique({
    where: { service },
  });
  return global ? new Decimal(global.level2Pct.toString()) : new Decimal('30');
}

function calculateCommission(
  tradeAmountNaira: Decimal,
  commissionType: ReferralCommissionType,
  commissionValue: Decimal,
): Decimal {
  if (commissionType === 'PERCENTAGE') {
    return tradeAmountNaira.mul(commissionValue).div(100);
  }
  return commissionValue;
}

/**
 * Credit referral commissions (level 1 + level 2) when a user completes a trade.
 * Call this AFTER the trade transaction has committed.
 * Safe to call even if user has no referrer — it will no-op.
 */
export async function creditReferralCommission(
  userId: number,
  service: ReferralService,
  tradeAmountNaira: number | Decimal,
) {
  try {
    const tradeAmount = new Decimal(tradeAmountNaira.toString());
    if (tradeAmount.lte(0)) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredBy: true },
    });

    if (!user?.referredBy) return;

    const level1ReferrerId = user.referredBy;

    const config = await getCommissionConfig(level1ReferrerId, service);
    if (!config) return;

    const level1Amount = calculateCommission(
      tradeAmount,
      config.commissionType,
      config.commissionValue,
    );

    if (level1Amount.lte(0)) return;

    await prisma.$transaction(async (tx) => {
      // --- Level 1: Direct referrer earns commission ---
      const l1Wallet = await getOrCreateWallet(level1ReferrerId, tx);

      await tx.referralWallet.update({
        where: { id: l1Wallet.id },
        data: { balance: { increment: level1Amount } },
      });

      await tx.referralEarning.create({
        data: {
          walletId: l1Wallet.id,
          userId: level1ReferrerId,
          sourceUserId: userId,
          level: 1,
          service,
          earningType: ReferralEarningType.TRADE_COMMISSION,
          tradeAmountNaira: tradeAmount,
          commissionType: config.commissionType,
          commissionValue: config.commissionValue,
          earnedAmount: level1Amount,
        },
      });

      // --- Level 2: Referrer's referrer earns override ---
      const level1Referrer = await tx.user.findUnique({
        where: { id: level1ReferrerId },
        select: { referredBy: true },
      });

      if (!level1Referrer?.referredBy) return;

      const level2ReferrerId = level1Referrer.referredBy;
      const level2Pct = await getLevel2Pct(service);
      const level2Amount = level1Amount.mul(level2Pct).div(100);

      if (level2Amount.lte(0)) return;

      const l2Wallet = await getOrCreateWallet(level2ReferrerId, tx);

      await tx.referralWallet.update({
        where: { id: l2Wallet.id },
        data: { balance: { increment: level2Amount } },
      });

      await tx.referralEarning.create({
        data: {
          walletId: l2Wallet.id,
          userId: level2ReferrerId,
          sourceUserId: userId,
          level: 2,
          service,
          earningType: ReferralEarningType.LEVEL2_OVERRIDE,
          tradeAmountNaira: tradeAmount,
          commissionType: ReferralCommissionType.PERCENTAGE,
          commissionValue: level2Pct,
          earnedAmount: level2Amount,
        },
      });
    });
  } catch (error) {
    console.error('[ReferralCommission] Failed to credit commission:', error);
  }
}

/**
 * Credit signup bonus to the referrer when a new user registers with a referral code.
 */
export async function creditSignupBonus(newUserId: number, referrerId: number) {
  try {
    const setting = await prisma.referralCommissionSetting.findFirst({
      where: { isActive: true },
      select: { signupBonus: true },
    });

    const bonusAmount = setting
      ? new Decimal(setting.signupBonus.toString())
      : new Decimal('10000');

    if (bonusAmount.lte(0)) return;

    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(referrerId, tx);

      await tx.referralWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: bonusAmount } },
      });

      await tx.referralEarning.create({
        data: {
          walletId: wallet.id,
          userId: referrerId,
          sourceUserId: newUserId,
          level: 1,
          service: ReferralService.CRYPTO_BUY,
          earningType: ReferralEarningType.SIGNUP_BONUS,
          tradeAmountNaira: null,
          commissionType: ReferralCommissionType.FIXED,
          commissionValue: bonusAmount,
          earnedAmount: bonusAmount,
        },
      });
    });
  } catch (error) {
    console.error('[ReferralCommission] Failed to credit signup bonus:', error);
  }
}
