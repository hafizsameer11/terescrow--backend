import { Request, Response, NextFunction } from 'express';
import { UserRoles } from '@prisma/client';
import {
  deriveAdminAction,
  extractTargetUserId,
  writeAdminAuditLog,
} from '../services/admin/admin.audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim();
  return String(req.ip || '');
}

/**
 * Logs mutating /api/admin/* calls after response finishes.
 * Mount before admin routers; reads req.user set by authenticateUser.
 */
export function adminAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!MUTATING.has(req.method.toUpperCase())) {
    return next();
  }

  res.on('finish', () => {
    try {
      const user = (req as any).user || (req as any).body?._user;
      if (!user?.id || user.role !== UserRoles.admin) return;
      // Skip the audit-list endpoint itself if ever mutating
      if (String(req.originalUrl || req.url).includes('/audit-logs')) return;

      const path = String(req.originalUrl || req.url || '').slice(0, 500);
      const action = deriveAdminAction(req.method, path);
      const targetUserId = extractTargetUserId(
        req.params as any,
        req.body as any,
        path
      );

      void writeAdminAuditLog({
        adminUserId: user.id,
        action,
        method: req.method.toUpperCase(),
        path,
        targetUserId,
        statusCode: res.statusCode,
        ip: clientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
        requestMeta: {
          params: req.params,
          query: req.query,
          body: req.body,
        },
      });
    } catch (err) {
      console.error('[AdminAudit] middleware error', err);
    }
  });

  next();
}

export default adminAuditMiddleware;
