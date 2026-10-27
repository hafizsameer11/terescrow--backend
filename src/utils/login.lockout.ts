/**
 * Durable DB login lockout — complements Redis 429 rate limits.
 * Survives Redis restarts; unlocks after lockedUntil or on successful login.
 */
import { prisma } from './prisma';
import ApiError from './ApiError';

/** Max wrong passwords before DB lock (default 5 — was soft Redis 10). */
export const LOGIN_LOCK_MAX = Math.max(
  3,
  Number(process.env.AUTH_LOGIN_LOCK_MAX || 5)
);
/** Lock duration in seconds (default 30 minutes). */
export const LOGIN_LOCK_SEC = Math.max(
  60,
  Number(process.env.AUTH_LOGIN_LOCK_SEC || 1800)
);

export function assertNotLoginLocked(user: {
  lockedUntil?: Date | null;
}): void {
  if (!user.lockedUntil) return;
  const until = new Date(user.lockedUntil).getTime();
  if (Number.isNaN(until) || until <= Date.now()) return;
  const retrySec = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  throw ApiError.tooManyRequests(
    `Account temporarily locked after too many failed login attempts. Try again in ${retrySec}s or reset your password.`
  );
}

/** Call after a wrong password for a known user. */
export async function recordFailedLogin(userId: number): Promise<{
  failedLoginCount: number;
  locked: boolean;
  lockedUntil: Date | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true, lockedUntil: true },
  });
  if (!user) {
    return { failedLoginCount: 0, locked: false, lockedUntil: null };
  }

  // Still inside an active lock — keep as-is
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    return {
      failedLoginCount: user.failedLoginCount,
      locked: true,
      lockedUntil: user.lockedUntil,
    };
  }

  const nextCount = (user.failedLoginCount || 0) + 1;
  const shouldLock = nextCount >= LOGIN_LOCK_MAX;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + LOGIN_LOCK_SEC * 1000)
    : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: nextCount,
      ...(shouldLock ? { lockedUntil } : { lockedUntil: null }),
    },
  });

  // On lock: also freeze money features (attacker may be probing for takeover)
  if (shouldLock) {
    try {
      const { autoFreezeOnAuthAbuse } = await import('./auth.abuse.freeze');
      await autoFreezeOnAuthAbuse({
        userId,
        source: 'login_lock',
        detail: `${nextCount} failed logins`,
      });
    } catch (err) {
      console.error('[login.lockout] auto-freeze failed:', err);
    }
  }

  return {
    failedLoginCount: nextCount,
    locked: shouldLock,
    lockedUntil,
  };
}

/** Call after successful password check. */
export async function clearLoginLockout(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
