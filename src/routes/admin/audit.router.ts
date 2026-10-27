import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';
import { listAdminAuditLogs } from '../../services/admin/admin.audit.service';

const router = express.Router();

/**
 * GET /api/admin/audit-logs
 * Query: page, limit, adminUserId, action, targetUserId
 */
router.get(
  '/audit-logs',
  authenticateUser,
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 50);
      const adminUserId = req.query.adminUserId
        ? Number(req.query.adminUserId)
        : undefined;
      const targetUserId = req.query.targetUserId
        ? Number(req.query.targetUserId)
        : undefined;
      const action = req.query.action
        ? String(req.query.action)
        : undefined;

      const data = await listAdminAuditLogs({
        page,
        limit,
        adminUserId:
          adminUserId && Number.isFinite(adminUserId) ? adminUserId : undefined,
        targetUserId:
          targetUserId && Number.isFinite(targetUserId)
            ? targetUserId
            : undefined,
        action,
      });
      return new ApiResponse(200, data, 'Admin audit logs').send(res);
    } catch (error) {
      if (error instanceof ApiError) return next(error);
      return next(ApiError.internal('Failed to load audit logs'));
    }
  }
);

export default router;
