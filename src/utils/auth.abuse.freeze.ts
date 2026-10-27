/**
 * Auto-freeze money features on auth brute-force signals:
 * failed-login lock, PIN rate exceed, OTP send/verify abuse.
 */
import { prisma } from './prisma';
import { applyFeatureFreezes, MONEY_FEATURES } from './auto.freeze';

const ENABLED =
  String(process.env.AUTH_AUTO_FREEZE_ENABLED || 'true').toLowerCase() !== 'false';

export async function autoFreezeOnAuthAbuse(opts: {
  userId: number;
  source: 'login_lock' | 'pin_rate' | 'otp_send' | 'otp_verify';
  detail?: string;
}): Promise<{ frozen: boolean }> {
  if (!ENABLED || !Number.isFinite(opts.userId) || opts.userId <= 0) {
    return { frozen: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { role: true },
  });
  // Only customer money features; do not mutate admin/agent freezes
  if (!user || String(user.role) !== 'customer') {
    return { frozen: false };
  }

  const labels: Record<typeof opts.source, string> = {
    login_lock: 'failed login lockout',
    pin_rate: 'PIN brute-force rate limit',
    otp_send: 'OTP send rate limit',
    otp_verify: 'OTP verify brute-force',
  };

  const reason =
    `Auto-frozen money features after ${labels[opts.source]}` +
    (opts.detail ? ` (${opts.detail})` : '') +
    '.';

  const result = await applyFeatureFreezes({
    userId: opts.userId,
    features: MONEY_FEATURES,
    reason,
    alertTitle: `Auto-freeze: auth abuse (${opts.source})`,
    alertDedupeKey: `auth:abuse:alerted:user:${opts.userId}:${opts.source}`,
    alertTtlSec: Math.max(60, Number(process.env.AUTH_AUTO_FREEZE_ALERT_TTL_SEC || 600)),
  });

  return { frozen: result.newlyFrozen.length > 0 || result.alreadyFrozen.length > 0 };
}

/** Resolve customer id by email (for OTP send abuse). */
export async function autoFreezeAuthAbuseByEmail(
  email: string,
  source: 'otp_send' | 'otp_verify',
  detail?: string
): Promise<{ frozen: boolean; userId: number | null }> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { frozen: false, userId: null };
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, role: true },
  });
  if (!user || String(user.role) !== 'customer') {
    return { frozen: false, userId: user?.id ?? null };
  }
  const r = await autoFreezeOnAuthAbuse({ userId: user.id, source, detail });
  return { frozen: r.frozen, userId: user.id };
}
