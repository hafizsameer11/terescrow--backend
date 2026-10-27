import ApiError from './ApiError';
import { redisConfig } from '../config/redis.config';
import { sendSystemEmail } from './systemEmail';
import { prisma } from './prisma';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';

/** Login: max failures per identifier (email/phone) per window. */
const LOGIN_WINDOW_SEC = Math.max(30, Number(process.env.AUTH_LOGIN_RATE_WINDOW_SEC || 900));
/** Align with DB lock threshold (default 5). */
const LOGIN_MAX = Math.max(3, Number(process.env.AUTH_LOGIN_RATE_MAX || 5));
/** Login: max failures per IP per window. */
const LOGIN_IP_WINDOW_SEC = Math.max(30, Number(process.env.AUTH_LOGIN_IP_WINDOW_SEC || 900));
const LOGIN_IP_MAX = Math.max(5, Number(process.env.AUTH_LOGIN_IP_RATE_MAX || 30));

/** PIN verify: max failures per user per window. */
const PIN_WINDOW_SEC = Math.max(30, Number(process.env.AUTH_PIN_RATE_WINDOW_SEC || 900));
const PIN_MAX = Math.max(3, Number(process.env.AUTH_PIN_RATE_MAX || 5));

/** Forgot-password / OTP send: max per email per window. */
const OTP_WINDOW_SEC = Math.max(30, Number(process.env.AUTH_OTP_RATE_WINDOW_SEC || 900));
const OTP_MAX = Math.max(1, Number(process.env.AUTH_OTP_RATE_MAX || 3));

/** Forgot-password / email OTP verify guesses per email per window. */
const OTP_VERIFY_WINDOW_SEC = Math.max(
  30,
  Number(process.env.AUTH_OTP_VERIFY_RATE_WINDOW_SEC || 900)
);
const OTP_VERIFY_MAX = Math.max(3, Number(process.env.AUTH_OTP_VERIFY_RATE_MAX || 5));

async function alertRedisDownOnce(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] Redis unavailable:`, msg);
  sendSystemEmail(
    OPS_ALERT_EMAIL,
    `[Tercescrow] Redis down — ${context}`,
    `<p><b>Redis auth rate-limit unavailable</b>.</p>
     <p>Context: <code>${context}</code></p>
     <p>Error: <code>${msg}</code></p>
     <p>Fallback: allowing request (fail-open). Fix Redis ASAP.</p>
     <p>Time: ${new Date().toISOString()}</p>`
  ).catch(() => undefined);
}

async function bumpOrThrow(opts: {
  key: string;
  windowSec: number;
  max: number;
  message: string;
}): Promise<void> {
  const redis = redisConfig.getClient();
  const count = await redis.incr(opts.key);
  if (count === 1) {
    await redis.expire(opts.key, opts.windowSec);
  }
  if (count > opts.max) {
    const ttl = await redis.ttl(opts.key);
    throw ApiError.tooManyRequests(
      `${opts.message} Try again in ${Math.max(ttl, 1)}s.`
    );
  }
}

function normalizeIdentifier(raw: string): string {
  return String(raw || '').trim().toLowerCase().slice(0, 191);
}

function clientIp(req: { ip?: string; headers?: any }): string {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim().slice(0, 64);
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim().slice(0, 64);
  return String(req.ip || 'unknown').slice(0, 64);
}

/** Call before checking password. Limits by identifier + IP. */
export async function assertLoginRateLimit(opts: {
  identifier: string;
  req?: { ip?: string; headers?: any };
}): Promise<void> {
  const id = normalizeIdentifier(opts.identifier);
  if (!id) return;
  try {
    try {
      await bumpOrThrow({
        key: `auth:login:id:${id}`,
        windowSec: LOGIN_WINDOW_SEC,
        max: LOGIN_MAX,
        message: `Too many login attempts for this account. Max ${LOGIN_MAX} per ${LOGIN_WINDOW_SEC}s.`,
      });
    } catch (idErr: any) {
      if (idErr instanceof ApiError) {
        await freezeOnLoginRateLimitIfKnown(id);
        throw idErr;
      }
      throw idErr;
    }
    if (opts.req) {
      const ip = clientIp(opts.req);
      await bumpOrThrow({
        key: `auth:login:ip:${ip}`,
        windowSec: LOGIN_IP_WINDOW_SEC,
        max: LOGIN_IP_MAX,
        message: `Too many login attempts from this network. Max ${LOGIN_IP_MAX} per ${LOGIN_IP_WINDOW_SEC}s.`,
      });
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    await alertRedisDownOnce('auth_login_rate_limit', err);
  }
}

/** Clear login failure counters after successful login. */
export async function clearLoginRateLimit(identifier: string): Promise<void> {
  const id = normalizeIdentifier(identifier);
  if (!id) return;
  try {
    const redis = redisConfig.getClient();
    await redis.del(`auth:login:id:${id}`);
  } catch {
    /* ignore */
  }
}

/** Call before comparing PIN. */
export async function assertPinRateLimit(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  try {
    await bumpOrThrow({
      key: `auth:pin:user:${userId}`,
      windowSec: PIN_WINDOW_SEC,
      max: PIN_MAX,
      message: `Too many PIN attempts. Max ${PIN_MAX} per ${PIN_WINDOW_SEC}s.`,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      try {
        const { autoFreezeOnAuthAbuse } = await import('./auth.abuse.freeze');
        await autoFreezeOnAuthAbuse({
          userId,
          source: 'pin_rate',
          detail: `max ${PIN_MAX}/${PIN_WINDOW_SEC}s`,
        });
      } catch (freezeErr) {
        console.error('[auth.rate.limit] PIN auto-freeze failed:', freezeErr);
      }
      throw err;
    }
    await alertRedisDownOnce('auth_pin_rate_limit', err);
  }
}

export async function clearPinRateLimit(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  try {
    const redis = redisConfig.getClient();
    await redis.del(`auth:pin:user:${userId}`);
  } catch {
    /* ignore */
  }
}

/** Call before sending forgot-password / resend OTP email. */
export async function assertOtpSendRateLimit(email: string): Promise<void> {
  const id = normalizeIdentifier(email);
  if (!id) return;
  try {
    await bumpOrThrow({
      key: `auth:otp:email:${id}`,
      windowSec: OTP_WINDOW_SEC,
      max: OTP_MAX,
      message: `Too many OTP requests. Max ${OTP_MAX} per ${OTP_WINDOW_SEC}s.`,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      try {
        const { autoFreezeAuthAbuseByEmail } = await import('./auth.abuse.freeze');
        await autoFreezeAuthAbuseByEmail(id, 'otp_send', `max ${OTP_MAX}/${OTP_WINDOW_SEC}s`);
      } catch (freezeErr) {
        console.error('[auth.rate.limit] OTP-send auto-freeze failed:', freezeErr);
      }
      throw err;
    }
    await alertRedisDownOnce('auth_otp_rate_limit', err);
  }
}

/**
 * Call before verifying forgot-password / email OTP.
 * Counts every verify attempt; on exceed freezes money features for that account.
 */
export async function assertOtpVerifyRateLimit(email: string): Promise<void> {
  const id = normalizeIdentifier(email);
  if (!id) return;
  try {
    await bumpOrThrow({
      key: `auth:otp:verify:${id}`,
      windowSec: OTP_VERIFY_WINDOW_SEC,
      max: OTP_VERIFY_MAX,
      message: `Too many OTP verification attempts. Max ${OTP_VERIFY_MAX} per ${OTP_VERIFY_WINDOW_SEC}s.`,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      try {
        const { autoFreezeAuthAbuseByEmail } = await import('./auth.abuse.freeze');
        await autoFreezeAuthAbuseByEmail(
          id,
          'otp_verify',
          `max ${OTP_VERIFY_MAX}/${OTP_VERIFY_WINDOW_SEC}s`
        );
      } catch (freezeErr) {
        console.error('[auth.rate.limit] OTP-verify auto-freeze failed:', freezeErr);
      }
      throw err;
    }
    await alertRedisDownOnce('auth_otp_verify_rate_limit', err);
  }
}

/** Also freeze when DB OTP attempt counter hits the hard max (wrong guesses). */
export async function freezeOnOtpAttemptsExhausted(userId: number): Promise<void> {
  try {
    const { autoFreezeOnAuthAbuse } = await import('./auth.abuse.freeze');
    await autoFreezeOnAuthAbuse({
      userId,
      source: 'otp_verify',
      detail: 'OTP attempts exhausted',
    });
  } catch (err) {
    console.error('[auth.rate.limit] OTP-attempts auto-freeze failed:', err);
  }
}

/** Optional: freeze when Redis login-id rate limit trips for a known customer email. */
export async function freezeOnLoginRateLimitIfKnown(identifier: string): Promise<void> {
  const id = normalizeIdentifier(identifier);
  if (!id || !id.includes('@')) return;
  try {
    const user = await prisma.user.findUnique({
      where: { email: id },
      select: { id: true, role: true },
    });
    if (!user || String(user.role) !== 'customer') return;
    const { autoFreezeOnAuthAbuse } = await import('./auth.abuse.freeze');
    await autoFreezeOnAuthAbuse({
      userId: user.id,
      source: 'login_lock',
      detail: 'login rate limit exceeded',
    });
  } catch (err) {
    console.error('[auth.rate.limit] login-rate auto-freeze failed:', err);
  }
}
