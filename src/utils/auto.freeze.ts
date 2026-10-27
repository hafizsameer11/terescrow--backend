/**
 * Shared feature auto-freeze + ops alert (money abuse, auth abuse, etc.).
 */
import { InAppNotificationType } from '@prisma/client';
import { prisma } from './prisma';
import {
  FEATURE_CRYPTO,
  FEATURE_DEPOSIT,
  FEATURE_GIFT_CARD,
  FEATURE_WITHDRAWAL,
  normalizeFeatureKey,
} from './customer.restrictions';
import { redisConfig } from '../config/redis.config';
import { sendSystemEmail } from './systemEmail';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';

/** Money-movement features frozen on compromise / brute-force signals. */
export const MONEY_FEATURES = [
  FEATURE_DEPOSIT,
  FEATURE_WITHDRAWAL,
  FEATURE_CRYPTO,
  FEATURE_GIFT_CARD,
].map(normalizeFeatureKey);

export async function applyFeatureFreezes(opts: {
  userId: number;
  features: string[];
  reason: string;
  alertTitle: string;
  alertDedupeKey: string;
  alertTtlSec?: number;
}): Promise<{ newlyFrozen: string[]; alreadyFrozen: string[] }> {
  const features = opts.features.map(normalizeFeatureKey);
  const newlyFrozen: string[] = [];
  const alreadyFrozen: string[] = [];

  for (const feature of features) {
    try {
      const existing = await (prisma as any).userFeatureFreeze.findUnique({
        where: { userId_feature: { userId: opts.userId, feature } },
      });
      if (existing) {
        alreadyFrozen.push(feature);
        continue;
      }
      await (prisma as any).userFeatureFreeze.upsert({
        where: { userId_feature: { userId: opts.userId, feature } },
        create: { userId: opts.userId, feature },
        update: {},
      });
      newlyFrozen.push(feature);
    } catch (err) {
      console.error(`[auto.freeze] upsert failed user=${opts.userId} feature=${feature}`, err);
    }
  }

  if (newlyFrozen.length === 0) {
    return { newlyFrozen, alreadyFrozen };
  }

  await prisma.accountActivity
    .create({
      data: {
        userId: opts.userId,
        description: opts.reason.slice(0, 500),
      },
    })
    .catch(() => undefined);

  let shouldAlert = true;
  try {
    const redis = redisConfig.getClient();
    const ttl = Math.max(60, opts.alertTtlSec || 600);
    const got = await redis.set(opts.alertDedupeKey, '1', 'EX', ttl, 'NX');
    shouldAlert = got === 'OK';
  } catch {
    /* alert anyway */
  }

  if (shouldAlert) {
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, username: true },
    });
    const label = user?.username || user?.email || `user #${opts.userId}`;
    const summary = `${label} (#${opts.userId}): ${opts.reason}`.slice(0, 500);

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
            title: opts.alertTitle.slice(0, 120),
            description: summary,
            type: InAppNotificationType.team,
          })),
        })
        .catch(() => undefined);
    }

    sendSystemEmail(
      OPS_ALERT_EMAIL,
      `[Tercescrow] ${opts.alertTitle} — user #${opts.userId}`,
      `<p><b>${opts.alertTitle}</b></p>
       <p>User: <code>${label}</code> (#${opts.userId})</p>
       <p>Newly frozen: <code>${newlyFrozen.join(', ')}</code></p>
       <p>${opts.reason}</p>
       <p>Unfreeze via admin customer freeze API when reviewed.</p>
       <p>Time: ${new Date().toISOString()}</p>`
    ).catch(() => undefined);
  }

  console.warn(`[auto.freeze] user=${opts.userId} new=${newlyFrozen.join(',')} reason=${opts.reason}`);
  return { newlyFrozen, alreadyFrozen };
}
