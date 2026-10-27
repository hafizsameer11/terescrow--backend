import ApiError from './ApiError';
import { redisConfig } from '../config/redis.config';
import { sendSystemEmail } from './systemEmail';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';

/** Sliding fixed window: max money ops (bill + withdraw) per user per window. */
const WINDOW_SEC = Math.max(10, Number(process.env.MONEY_OP_RATE_WINDOW_SEC || 60));
const MAX_OPS = Math.max(1, Number(process.env.MONEY_OP_RATE_MAX || 5));
/** Tighter cap for betting scene specifically. */
const MAX_BETTING = Math.max(1, Number(process.env.MONEY_BETTING_RATE_MAX || 3));

async function alertRedisDownOnce(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] Redis unavailable:`, msg);
  sendSystemEmail(
    OPS_ALERT_EMAIL,
    `[Tercescrow] Redis down — ${context}`,
    `<p><b>Redis rate-limit unavailable</b>.</p>
     <p>Context: <code>${context}</code></p>
     <p>Error: <code>${msg}</code></p>
     <p>Fallback: mutex/DB checks only (rate limit skipped this request).</p>
     <p>Time: ${new Date().toISOString()}</p>`
  ).catch(() => undefined);
}

/**
 * Enforce per-user money-op rate limit.
 * Throws ApiError.badRequest when exceeded.
 * If Redis is down, logs/alerts and allows (mutex + debit-first still apply).
 */
export async function assertMoneyOpRateLimit(opts: {
  userId: number;
  kind: 'bill' | 'withdraw';
  sceneCode?: string;
}): Promise<void> {
  const { userId, kind, sceneCode } = opts;
  const isBetting = kind === 'bill' && String(sceneCode || '').toLowerCase() === 'betting';

  try {
    const redis = redisConfig.getClient();

    // Combined money ops (bill + withdraw)
    const moneyKey = `money:rate:user:${userId}`;
    const moneyCount = await redis.incr(moneyKey);
    if (moneyCount === 1) {
      await redis.expire(moneyKey, WINDOW_SEC);
    }
    if (moneyCount > MAX_OPS) {
      const ttl = await redis.ttl(moneyKey);
      throw ApiError.badRequest(
        `Too many money operations. Max ${MAX_OPS} per ${WINDOW_SEC}s. Try again in ${Math.max(ttl, 1)}s.`
      );
    }

    // Extra tight limit for betting spam
    if (isBetting) {
      const betKey = `money:rate:betting:user:${userId}`;
      const betCount = await redis.incr(betKey);
      if (betCount === 1) {
        await redis.expire(betKey, WINDOW_SEC);
      }
      if (betCount > MAX_BETTING) {
        const ttl = await redis.ttl(betKey);
        throw ApiError.badRequest(
          `Too many betting requests. Max ${MAX_BETTING} per ${WINDOW_SEC}s. Try again in ${Math.max(ttl, 1)}s.`
        );
      }
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    await alertRedisDownOnce(`money_rate_limit:${kind}`, err);
  }
}
