/**
 * One in-flight Obiex money trade per user (buy/sell/swap/send).
 * Stops double-tap / parallel API calls creating two trades at once.
 */
import { redisConfig } from '../config/redis.config';
import ApiError from './ApiError';
import { sendSystemEmail } from './systemEmail';

const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';
const LOCK_TTL_SEC = Math.max(30, Number(process.env.OBIEX_TRADE_LOCK_TTL_SEC || 120));

async function alertRedisDown(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[Obiex trade lock] Redis unavailable:', msg);
  sendSystemEmail(
    OPS_ALERT_EMAIL,
    '[Tercescrow] Redis down — obiex_trade_lock',
    `<p>Obiex per-user trade lock skipped (fail-open).</p>
     <p>Error: <code>${msg}</code></p>
     <p>Time: ${new Date().toISOString()}</p>`
  ).catch(() => undefined);
}

export async function withObiexUserTradeLock<T>(
  userId: number,
  fn: () => Promise<T>
): Promise<T> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw ApiError.unauthorized('User not authenticated');
  }

  const key = `obiex:trade:lock:user:${userId}`;
  let held = false;

  try {
    try {
      const redis = redisConfig.getClient();
      const got = await redis.set(key, String(Date.now()), 'EX', LOCK_TTL_SEC, 'NX');
      if (got !== 'OK') {
        throw ApiError.badRequest(
          'Another crypto trade is already in progress. Please wait for it to finish.'
        );
      }
      held = true;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      await alertRedisDown(err);
      // Fail-open: debitWallet / debitObiexAsset still serialize balance
    }

    return await fn();
  } finally {
    if (held) {
      try {
        await redisConfig.getClient().del(key);
      } catch {
        /* TTL will clear */
      }
    }
  }
}
