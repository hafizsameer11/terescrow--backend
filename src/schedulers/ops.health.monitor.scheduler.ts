import { prisma } from '../utils/prisma';
import { sendSystemEmail } from '../utils/systemEmail';
import { redisConfig } from '../config/redis.config';
import { palmpayMerchantService } from '../services/palmpay/palmpay.merchant.service';

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.OPS_MONITOR_INTERVAL_MS || 5 * 60 * 1000)
);
const ALERT_TO = process.env.OPS_ALERT_EMAIL || 'hmstech11@gmail.com';
const MERCHANT_LOW_NGN = Number(process.env.OPS_MERCHANT_LOW_NGN || 5000);
const BILL_FAIL_THRESHOLD = Number(process.env.OPS_BILL_FAIL_THRESHOLD || 15);
const WITHDRAW_FAIL_THRESHOLD = Number(process.env.OPS_WITHDRAW_FAIL_THRESHOLD || 8);
const FAIL_WINDOW_MIN = Number(process.env.OPS_FAIL_WINDOW_MIN || 10);
const ALERT_COOLDOWN_SEC = Number(process.env.OPS_ALERT_COOLDOWN_SEC || 30 * 60);
const LARGE_WITHDRAW_NGN = Number(process.env.OPS_LARGE_WITHDRAW_NGN || 50000);
const REFUND_SPIKE_THRESHOLD = Number(process.env.OPS_REFUND_SPIKE_THRESHOLD || 20);
const SUSPICIOUS_WALLET_NGN = Number(process.env.OPS_SUSPICIOUS_WALLET_NGN || 200000);
const MERCHANT_DROP_NGN = Number(process.env.OPS_MERCHANT_DROP_NGN || 30000);
const SINGLE_USER_BILL_FAIL = Number(process.env.OPS_SINGLE_USER_BILL_FAIL || 10);

type Alert = { code: string; title: string; detail: string };

async function canSendAlert(code: string): Promise<boolean> {
  try {
    const redis = redisConfig.getClient();
    const key = `ops:alert:cooldown:${code}`;
    const got = await redis.set(key, String(Date.now()), 'EX', ALERT_COOLDOWN_SEC, 'NX');
    return got === 'OK';
  } catch {
    // If Redis down, still allow email (better noisy than silent)
    return true;
  }
}

async function checkRedis(): Promise<Alert | null> {
  try {
    const redis = redisConfig.getClient();
    const pong = await redis.ping();
    if (String(pong).toUpperCase() !== 'PONG') {
      return {
        code: 'redis_bad_pong',
        title: 'Redis not responding correctly',
        detail: `PING returned: ${pong}`,
      };
    }
    return null;
  } catch (e: any) {
    return {
      code: 'redis_down',
      title: 'Redis is DOWN',
      detail: e?.message || String(e),
    };
  }
}

async function checkMerchantBalance(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  try {
    const bal = await palmpayMerchantService.queryMerchantBalance();
    const available = Number(bal?.availableBalanceNgn);
    const unsettled = Number((bal as any)?.unSettleBalanceNgn ?? 0);
    if (!Number.isFinite(available)) {
      alerts.push({
        code: 'merchant_balance_unreadable',
        title: 'PalmPay merchant balance unreadable',
        detail: JSON.stringify(bal),
      });
      return alerts;
    }
    if (available < MERCHANT_LOW_NGN) {
      alerts.push({
        code: 'merchant_balance_low',
        title: `PalmPay merchant available LOW (₦${available.toLocaleString()})`,
        detail:
          `Available: ₦${available.toLocaleString()} (threshold ₦${MERCHANT_LOW_NGN.toLocaleString()}). ` +
          `Unsettled: ₦${Number.isFinite(unsettled) ? unsettled.toLocaleString() : 'n/a'}. ` +
          `Payouts/bills may fail.`,
      });
    }

    // Sudden drop vs last poll (money leaving merchant float fast)
    try {
      const redis = redisConfig.getClient();
      const prevRaw = await redis.get('ops:merchant:available_ngn');
      await redis.set('ops:merchant:available_ngn', String(available), 'EX', 24 * 3600);
      if (prevRaw != null) {
        const prev = Number(prevRaw);
        if (Number.isFinite(prev) && prev - available >= MERCHANT_DROP_NGN) {
          alerts.push({
            code: 'merchant_balance_drop',
            title: `PalmPay merchant dropped ₦${(prev - available).toLocaleString()} since last check`,
            detail: `Was ₦${prev.toLocaleString()} → now ₦${available.toLocaleString()} (drop threshold ₦${MERCHANT_DROP_NGN.toLocaleString()}).`,
          });
        }
      }
    } catch {
      /* ignore redis tracking errors */
    }

    return alerts;
  } catch (e: any) {
    return [
      {
        code: 'merchant_balance_error',
        title: 'Failed to query PalmPay merchant balance',
        detail: e?.message || String(e),
      },
    ];
  }
}

async function checkBillFailures(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const failed = await prisma.billPayment.count({
    where: { status: 'failed', createdAt: { gte: since } },
  });
  if (failed >= BILL_FAIL_THRESHOLD) {
    const topUsers = await prisma.billPayment.groupBy({
      by: ['userId'],
      where: { status: 'failed', createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    });
    return {
      code: 'bill_fail_spike',
      title: `Bill payment failure spike: ${failed} in ${FAIL_WINDOW_MIN}m`,
      detail:
        `Threshold: ${BILL_FAIL_THRESHOLD}. Top userIds: ` +
        topUsers.map((u) => `${u.userId}×${u._count._all}`).join(', '),
    };
  }
  return null;
}

async function checkWithdrawFailures(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const failed = await prisma.fiatTransaction.count({
    where: {
      type: 'WITHDRAW',
      status: 'failed',
      createdAt: { gte: since },
    },
  });
  if (failed >= WITHDRAW_FAIL_THRESHOLD) {
    return {
      code: 'withdraw_fail_spike',
      title: `Withdraw failure spike: ${failed} in ${FAIL_WINDOW_MIN}m`,
      detail: `Threshold: ${WITHDRAW_FAIL_THRESHOLD}.`,
    };
  }
  return null;
}

async function checkStuckPendingBills(): Promise<Alert | null> {
  const olderThan = new Date(Date.now() - 15 * 60 * 1000);
  const stuck = await prisma.billPayment.count({
    where: {
      status: 'pending',
      createdAt: { lte: olderThan },
    },
  });
  if (stuck > 0) {
    return {
      code: 'stuck_pending_bills',
      title: `Stuck pending bills: ${stuck} older than 15m`,
      detail: 'These should be investigated (possible provider fail left pending).',
    };
  }
  return null;
}

async function checkBannedUserActivity(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const banned = await prisma.user.findMany({
    where: { status: 'banned', role: 'customer' },
    select: { id: true },
    take: 200,
  });
  if (!banned.length) return null;
  const ids = banned.map((b) => b.id);
  const recent = await prisma.fiatTransaction.count({
    where: {
      userId: { in: ids },
      createdAt: { gte: since },
      type: { in: ['WITHDRAW', 'BILL_PAYMENT', 'DEPOSIT'] },
      status: { in: ['completed', 'pending'] },
      description: { not: { contains: 'Admin clawback' } },
    },
  });
  if (recent > 0) {
    return {
      code: 'banned_user_activity',
      title: `Banned users still creating money txs: ${recent} in ${FAIL_WINDOW_MIN}m`,
      detail: 'A banned account may still be moving funds — investigate immediately.',
    };
  }
  return null;
}

/** Refund-race style: many "Refund for failed bill payment" in short window */
async function checkRefundSpike(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const refunds = await prisma.fiatTransaction.count({
    where: {
      type: 'BILL_PAYMENT',
      status: 'completed',
      createdAt: { gte: since },
      description: { startsWith: 'Refund for failed bill payment' },
    },
  });
  if (refunds >= REFUND_SPIKE_THRESHOLD) {
    const top = await prisma.$queryRaw<Array<{ userId: number; c: bigint }>>`
      SELECT userId, COUNT(*) AS c
      FROM FiatTransaction
      WHERE type = 'BILL_PAYMENT'
        AND status = 'completed'
        AND createdAt >= ${since}
        AND description LIKE 'Refund for failed bill payment%'
      GROUP BY userId
      ORDER BY c DESC
      LIMIT 5
    `;
    return {
      code: 'bill_refund_spike',
      title: `Bill refund spike: ${refunds} in ${FAIL_WINDOW_MIN}m (possible race/abuse)`,
      detail:
        `Threshold: ${REFUND_SPIKE_THRESHOLD}. Top users: ` +
        top.map((r) => `${r.userId}×${Number(r.c)}`).join(', '),
    };
  }
  return null;
}

/** One user failing many bills = brute force pattern */
async function checkSingleUserBillFailBurst(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const top = await prisma.billPayment.groupBy({
    by: ['userId'],
    where: { status: 'failed', createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { userId: 'desc' } },
    take: 1,
  });
  const row = top[0];
  if (row && row._count._all >= SINGLE_USER_BILL_FAIL) {
    return {
      code: 'user_bill_fail_burst',
      title: `User ${row.userId} failed ${row._count._all} bills in ${FAIL_WINDOW_MIN}m`,
      detail: 'Looks like brute-force / spam betting. Consider freeze.',
    };
  }
  return null;
}

/** Large completed withdraws */
async function checkLargeWithdraws(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const rows = await prisma.fiatTransaction.findMany({
    where: {
      type: 'WITHDRAW',
      status: { in: ['completed', 'pending'] },
      createdAt: { gte: since },
      amount: { gte: LARGE_WITHDRAW_NGN },
    },
    select: { id: true, userId: true, amount: true, payeeBankAccNo: true, createdAt: true },
    orderBy: { amount: 'desc' },
    take: 10,
  });
  if (!rows.length) return null;
  return {
    code: 'large_withdraws',
    title: `${rows.length} large withdraw(s) ≥ ₦${LARGE_WITHDRAW_NGN.toLocaleString()} in ${FAIL_WINDOW_MIN}m`,
    detail: rows
      .map(
        (r) =>
          `user ${r.userId} ₦${Number(r.amount).toLocaleString()} → ${r.payeeBankAccNo || '?'} (${r.id.slice(0, 8)})`
      )
      .join(' | '),
  };
}

/** Active wallets with huge NGN and no permanent-VA deposit history (likely fake/test) */
async function checkSuspiciousWallets(): Promise<Alert | null> {
  const big = await prisma.fiatWallet.findMany({
    where: {
      currency: 'NGN',
      status: 'active',
      balance: { gte: SUSPICIOUS_WALLET_NGN },
    },
    select: { userId: true, balance: true },
    take: 20,
  });
  if (!big.length) return null;

  const suspicious: string[] = [];
  for (const w of big) {
    const vaDeposits = await prisma.fiatTransaction.count({
      where: {
        userId: w.userId,
        type: 'DEPOSIT',
        status: 'completed',
        OR: [
          { description: { contains: 'permanent account' } },
          { palmpayOrderNo: { not: null } },
        ],
      },
    });
    const sells = await prisma.fiatTransaction.count({
      where: { userId: w.userId, type: 'CRYPTO_SELL', status: 'completed' },
    });
    if (vaDeposits === 0 && sells === 0) {
      suspicious.push(`user ${w.userId} ₦${Number(w.balance).toLocaleString()} (no VA/crypto sell)`);
    }
  }
  if (!suspicious.length) return null;
  return {
    code: 'suspicious_wallets',
    title: `${suspicious.length} suspicious high NGN wallet(s) ≥ ₦${SUSPICIOUS_WALLET_NGN.toLocaleString()}`,
    detail: suspicious.slice(0, 8).join(' | '),
  };
}

/** Merchant-insufficient errors = float empty while users still trying */
async function checkMerchantInsufficientErrors(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const n = await prisma.fiatTransaction.count({
    where: {
      createdAt: { gte: since },
      status: 'failed',
      OR: [
        { errorMessage: { contains: 'MERCHANT_ACCOUNT_BALANCE_NOT_ENOUGH' } },
        { errorMessage: { contains: 'Account balance is insufficient' } },
        { errorMessage: { contains: 'low settlement balance' } },
      ],
    },
  });
  if (n >= 5) {
    return {
      code: 'merchant_insufficient_errors',
      title: `${n} merchant-insufficient failures in ${FAIL_WINDOW_MIN}m`,
      detail: 'Users are hitting empty PalmPay float. Fund merchant or pause payouts/bills.',
    };
  }
  return null;
}

/** Obiex sell settlement failures leave NGNX stranded / user credited without PalmPay funding */
async function checkObiexSellSettlementFails(): Promise<Alert | null> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000);
  const sells = await prisma.fiatTransaction.findMany({
    where: {
      type: 'CRYPTO_SELL',
      status: 'completed',
      createdAt: { gte: since },
      metadata: { contains: 'obiexSellSettlement' },
    },
    select: { id: true, userId: true, amount: true, metadata: true },
    take: 50,
  });
  const failed: string[] = [];
  for (const s of sells) {
    try {
      const m = JSON.parse(String(s.metadata || '{}'));
      const st = m?.obiexSellSettlement?.status || m?.feesForAdmin?.settlementStatus;
      if (st && st !== 'success') {
        failed.push(
          `user ${s.userId} ₦${Number(s.amount).toLocaleString()} settlement=${st} (${s.id.slice(0, 8)})`
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (!failed.length) return null;
  return {
    code: 'obiex_sell_settlement_fail',
    title: `${failed.length} Obiex sell settlement issue(s) in ${FAIL_WINDOW_MIN}m`,
    detail: failed.slice(0, 8).join(' | '),
  };
}

export async function runOpsHealthMonitorPoll() {
  const checks = await Promise.all([
    checkRedis(),
    checkMerchantBalance(),
    checkBillFailures(),
    checkWithdrawFailures(),
    checkStuckPendingBills(),
    checkBannedUserActivity(),
    checkRefundSpike(),
    checkSingleUserBillFailBurst(),
    checkLargeWithdraws(),
    checkSuspiciousWallets(),
    checkMerchantInsufficientErrors(),
    checkObiexSellSettlementFails(),
  ]);

  const alerts = checks.flat().filter(Boolean) as Alert[];
  if (!alerts.length) {
    console.log('[OPS MONITOR] OK — no alerts');
    return;
  }

  const toSend: Alert[] = [];
  for (const a of alerts) {
    if (await canSendAlert(a.code)) toSend.push(a);
    else console.log(`[OPS MONITOR] cooldown skip: ${a.code}`);
  }
  if (!toSend.length) return;

  const html = `
    <h2>Tercescrow Ops Alert</h2>
    <p>${toSend.length} issue(s) detected at ${new Date().toISOString()}</p>
    <ul>
      ${toSend
        .map(
          (a) =>
            `<li><b>${a.title}</b><br/><code>${a.code}</code><br/>${a.detail}</li>`
        )
        .join('')}
    </ul>
    <p>Cooldownoldown per alert code: ${ALERT_COOLDOWN_SEC}s (won’t spam the same issue).</p>
  `;

  const ok = await sendSystemEmail(
    ALERT_TO,
    `[Tercescrow OPS] ${toSend.map((a) => a.code).join(', ')}`,
    html
  );
  console.log(
    `[OPS MONITOR] emailed ${ALERT_TO} ok=${ok} alerts=${toSend.map((a) => a.code).join(',')}`
  );
}

export function startOpsHealthMonitorScheduler() {
  // Slight delay so boot isn’t slowed by PalmPay/Redis
  setTimeout(() => {
    runOpsHealthMonitorPoll().catch((e) =>
      console.error('[OPS MONITOR] first run failed', e?.message || e)
    );
  }, 15_000);

  const interval = setInterval(() => {
    runOpsHealthMonitorPoll().catch((e) =>
      console.error('[OPS MONITOR]', e?.message || e)
    );
  }, INTERVAL_MS);

  console.log(
    `[OPS MONITOR] Scheduler started (every ${Math.round(INTERVAL_MS / 60000)}m) → ${ALERT_TO}`
  );
  return () => clearInterval(interval);
}
