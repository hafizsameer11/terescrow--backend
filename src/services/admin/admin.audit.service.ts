import { prisma } from '../../utils/prisma';

const SENSITIVE_KEYS = new Set([
  'password',
  'pin',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'otp',
  'mnemonic',
  'privateKey',
  'seed',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k) || /password|secret|token|pin|mnemonic|private/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

export function deriveAdminAction(method: string, path: string): string {
  const p = path.toLowerCase();
  const m = method.toUpperCase();
  if (p.includes('/ban')) return 'customer.ban';
  if (p.includes('/unban')) return 'customer.unban';
  if (p.includes('/freeze')) return 'customer.freeze';
  if (p.includes('/unfreeze')) return 'customer.unfreeze';
  if (p.includes('/va-deposit-review') && p.includes('/approve')) return 'va_deposit.approve';
  if (p.includes('/va-deposit-review') && p.includes('/reject')) return 'va_deposit.reject';
  if (p.includes('/revoke')) return 'transaction.revoke';
  if (p.includes('/user-balances') || p.includes('/adjust')) return 'balance.adjust';
  if (p.includes('/master-wallet')) return 'master_wallet.action';
  if (p.includes('/create-agent') || p.includes('/create-team-member')) return 'staff.create';
  return `${m}:${p.split('?')[0].slice(0, 80)}`;
}

export function extractTargetUserId(
  params: Record<string, unknown> | undefined,
  body: Record<string, unknown> | undefined,
  path: string
): number | null {
  const candidates = [
    params?.customerId,
    params?.userId,
    params?.id,
    body?.userId,
    body?.customerId,
    body?.targetUserId,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const m = path.match(/\/customers\/(\d+)/i) || path.match(/\/users\/(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

export async function writeAdminAuditLog(input: {
  adminUserId: number;
  action: string;
  method: string;
  path: string;
  targetUserId?: number | null;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  requestMeta?: unknown;
}): Promise<void> {
  try {
    let metaStr: string | null = null;
    if (input.requestMeta != null) {
      metaStr = JSON.stringify(redact(input.requestMeta)).slice(0, 20000);
    }
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: String(input.action).slice(0, 100),
        method: String(input.method).slice(0, 10),
        path: String(input.path).slice(0, 500),
        targetUserId: input.targetUserId ?? null,
        statusCode: input.statusCode ?? null,
        ip: input.ip ? String(input.ip).slice(0, 64) : null,
        userAgent: input.userAgent ? String(input.userAgent).slice(0, 500) : null,
        requestMeta: metaStr,
      },
    });
  } catch (err) {
    console.error('[AdminAudit] failed to write log', err);
  }
}

/** Explicit log from services (when no HTTP finish hook). */
export async function logAdminAction(opts: {
  adminUserId: number;
  action: string;
  method?: string;
  path?: string;
  targetUserId?: number | null;
  meta?: unknown;
  ip?: string | null;
}): Promise<void> {
  await writeAdminAuditLog({
    adminUserId: opts.adminUserId,
    action: opts.action,
    method: opts.method || 'SERVICE',
    path: opts.path || opts.action,
    targetUserId: opts.targetUserId,
    statusCode: 200,
    ip: opts.ip,
    requestMeta: opts.meta,
  });
}

export async function listAdminAuditLogs(opts: {
  page?: number;
  limit?: number;
  adminUserId?: number;
  action?: string;
  targetUserId?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const where: any = {};
  if (opts.adminUserId) where.adminUserId = opts.adminUserId;
  if (opts.action) where.action = { contains: opts.action };
  if (opts.targetUserId) where.targetUserId = opts.targetUserId;

  const [total, items] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        admin: {
          select: { id: true, email: true, firstname: true, lastname: true, role: true },
        },
      },
    }),
  ]);

  return { page, limit, total, items };
}
