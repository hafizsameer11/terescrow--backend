/**
 * Auto-freeze money features when a user repeatedly hits the money-op rate limit.
 * Admin can unfreeze via the existing customer freeze APIs.
 */
import { InAppNotificationType } from '@prisma/client';
import { prisma } from './prisma';
import {
  FEATURE_CRYPTO,
  FEATURE_WITHDRAWAL,
  normalizeFeatureKey,
} from './customer.restrictions';
import { redisConfig } from '../config/redis.config';
import { sendSystemEmail } from './systemEmail';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';

const ENABLED =
  String(process.env.MONEY_OP_AUTO_FREEZE_ENABLED || 'true').toLowerCase() !== 'false';
/** Rate-limit rejections within the abuse window before freeze (default 3 ≈ 5th attempt when max=2). */
const STRIKES = Math.max(1, Number(process.env.MONEY_OP_AUTO_FREEZE_STRIKES || 3));
const ABUSE_WINDOW_SEC = Math.max(
  60,
  Number(process.env.MONEY_OP_AUTO_FREEZE_WINDOW_SEC || 600)
);

export type MoneyAbuseKind = 'bill' | 'withdraw' | 'crypto';

function featureForKind(kind: MoneyAbuseKind): string {
  if (kind === 'crypto') return FEATURE_CRYPTO;
  // Bills are gated by withdrawal freeze in routes
  return FEATURE_WITHDRAWAL;
}

function labelForFeature(feature: string): string {
  if (feature === FEATURE_CRYPTO) return 'Crypto';
  return 'Withdrawal / bill payment';
}

/**
 * Record a rate-limit rejection. When strike threshold is reached, freeze the
 * matching feature immediately and notify ops (once per freeze event).
 * Returns true if this call applied (or already has) an auto-freeze.
 */
export async function recordMoneyRateLimitStrike(opts: {
  userId: number;
  kind: MoneyAbuseKind;
  sceneCode?: string;
}): Promise<{ frozen: boolean; feature: string; strikes: number }> {
  const feature = normalizeFeatureKey(featureForKind(opts.kind));
  if (!ENABLED) {
    return { frozen: false, feature, strikes: 0 };
  }

  let strikes = 0;
  try {
    const redis = redisConfig.getClient();
    const strikeKey = `money:abuse:strikes:user:${opts.userId}`;
    strikes = await redis.incr(strikeKey);
    if (strikes === 1) {
      await redis.expire(strikeKey, ABUSE_WINDOW_SEC);
    }
  } catch (err) {
    console.error('[money.abuse.freeze] Redis strike counter failed:', err);
    // Fail closed toward freeze if they already exceed soft limit many times? Prefer no false freeze.
    return { frozen: false, feature, strikes: 0 };
  }

  if (strikes < STRIKES) {
    return { frozen: false, feature, strikes };
  }

  try {
    const existing = await (prisma as any).userFeatureFreeze.findUnique({
      where: { userId_feature: { userId: opts.userId, feature } },
    });
    if (existing) {
      return { frozen: true, feature, strikes };
    }

    await (prisma as any).userFeatureFreeze.upsert({
      where: { userId_feature: { userId: opts.userId, feature } },
      create: { userId: opts.userId, feature },
      update: {},
    });

    const reason =
      `Auto-frozen (${labelForFeature(feature)}) after ${strikes} money rate-limit hits ` +
      `within ${ABUSE_WINDOW_SEC}s (kind=${opts.kind}` +
      `${opts.sceneCode ? `, scene=${opts.sceneCode}` : ''}).`;

    await prisma.accountActivity.create({
      data: {
        userId: opts.userId,
        description: reason.slice(0, 500),
      },
    }).catch(() => undefined);

    // Dedupe alerts for this freeze burst
    let shouldAlert = true;
    try {
      const redis = redisConfig.getClient();
      const alertKey = `money:abuse:alerted:user:${opts.userId}:${feature}`;
      const got = await redis.set(alertKey, '1', 'EX', ABUSE_WINDOW_SEC, 'NX');
      shouldAlert = got === 'OK';
    } catch {
      /* alert anyway */
    }

    if (shouldAlert) {
      const user = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { email: true, username: true, firstname: true },
      });
      const label = user?.username || user?.email || `user #${opts.userId}`;

      const admins = await prisma.user.findMany({
        where: { role: 'admin' },
        select: { id: true },
        take: 50,
      });
      if (admins.length > 0) {
        await prisma.inAppNotification
          .createMany({
            data: admins.map((a) => ({
              userId: a.id,
              title: 'Auto-freeze: money rate abuse',
              description: `${label} (#${opts.userId}): ${reason}`.slice(0, 500),
              type: InAppNotificationType.team,
            })),
          })
          .catch(() => undefined);
      }

      sendSystemEmail(
        OPS_ALERT_EMAIL,
        `[Tercescrow] Auto-freeze user #${opts.userId} (${feature})`,
        `<p><b>Money rate-limit abuse → feature auto-frozen</b></p>
         <p>User: <code>${label}</code> (#${opts.userId})</p>
         <p>Feature: <code>${feature}</code></p>
         <p>Strikes: <code>${strikes}</code> / threshold <code>${STRIKES}</code></p>
         <p>Kind: <code>${opts.kind}</code></p>
         <p>${reason}</p>
         <p>Unfreeze via admin customer freeze API when reviewed.</p>
         <p>Time: ${new Date().toISOString()}</p>`
      ).catch(() => undefined);
    }

    console.warn(`[money.abuse.freeze] ${reason} userId=${opts.userId}`);
    return { frozen: true, feature, strikes };
  } catch (err) {
    console.error('[money.abuse.freeze] Failed to apply freeze:', err);
    return { frozen: false, feature, strikes };
  }
}

export function moneyAbuseFreezeMessage(feature: string): string {
  return (
    `${labelForFeature(feature)} is temporarily disabled for your account due to unusual activity. ` +
    `Contact support if you need help.`
  );
}
