import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { UserRoles } from '@prisma/client';
import * as dailyReportService from '../../services/admin/daily.report.service';

export async function getShiftSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await dailyReportService.getShiftSettings();
    return new ApiResponse(200, settings, 'Shift settings retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get shift settings'));
  }
}

export async function putShiftSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user || req.body._user;
    if (user.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('Admin access required'));
    }
    const settings = await dailyReportService.updateShiftSettings(req.body);
    return new ApiResponse(200, settings, 'Shift settings updated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to update shift settings'));
  }
}

export async function getLogsController(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = req.query.agentId ? parseInt(String(req.query.agentId), 10) : undefined;
    const logs = await dailyReportService.getDailyReportLogs({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      shift: req.query.shift as string,
      agentId: isNaN(agentId as number) ? undefined : agentId,
    });
    return new ApiResponse(200, { logs }, 'Logs retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get logs'));
  }
}

export async function getReportByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const reportId = parseInt(req.params.reportId, 10);
    if (isNaN(reportId)) return next(ApiError.badRequest('Invalid report id'));
    const report = await dailyReportService.getReportById(reportId);
    if (!report) return next(ApiError.notFound('Report not found'));
    return new ApiResponse(200, report, 'Report retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get report'));
  }
}

export async function getSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = req.query.agentId ? parseInt(String(req.query.agentId), 10) : undefined;
    const summary = await dailyReportService.getDailyReportSummary(
      isNaN(agentId as number) ? undefined : agentId
    );
    return new ApiResponse(200, summary, 'Summary retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get summary'));
  }
}

export async function getAvgWorkHoursChartController(req: Request, res: Response, next: NextFunction) {
  try {
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 7;
    const data = await dailyReportService.getAvgWorkHoursChart(isNaN(days) ? 7 : days);
    return new ApiResponse(200, { data }, 'Chart data retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get chart'));
  }
}

export async function getWorkHoursPerMonthChartController(req: Request, res: Response, next: NextFunction) {
  try {
    const months = req.query.months ? parseInt(String(req.query.months), 10) : 3;
    const data = await dailyReportService.getWorkHoursPerMonthChart(isNaN(months) ? 3 : months);
    return new ApiResponse(200, { data }, 'Chart data retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get chart'));
  }
}

export async function postCheckInController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('Not authenticated'));
    if (user.role !== UserRoles.agent && user.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('Agent access required for check-in'));
    }
    const { shift, timestamp } = req.body;
    if (!shift) return next(ApiError.badRequest('shift is required'));
    const log = await dailyReportService.checkIn(user.id, shift, timestamp ? new Date(timestamp) : undefined);
    return new ApiResponse(200, { log }, 'Checked in').send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal(error.message || 'Check-in failed'));
  }
}

export async function postCheckOutController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('Not authenticated'));
    if (user.role !== UserRoles.agent && user.role !== UserRoles.admin) {
      return next(ApiError.unauthorized('Agent access required for check-out'));
    }
    const { timestamp } = req.body;
    const log = await dailyReportService.checkOut(user.id, timestamp ? new Date(timestamp) : undefined);
    return new ApiResponse(200, { log }, 'Checked out').send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal(error.message || 'Check-out failed'));
  }
}

export async function patchReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const reportId = parseInt(req.params.reportId, 10);
    if (isNaN(reportId)) return next(ApiError.badRequest('Invalid report id'));
    const user = (req as any).user || req.body._user;
    const isAdminOrAuditor = user?.role === UserRoles.admin;
    const { status, auditorsReport, myReport } = req.body;
    const updated = await dailyReportService.updateReport(
      reportId,
      { status, auditorsReport, myReport },
      isAdminOrAuditor
    );
    return new ApiResponse(200, updated, 'Report updated').send(res);
  } catch (error: any) {
    if (error?.code === 'P2025') return next(ApiError.notFound('Report not found'));
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to update report'));
  }
}
