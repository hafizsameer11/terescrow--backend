import { prisma } from '../../utils/prisma';
import { UserRoles } from '@prisma/client';

const shiftModel = (prisma as any).shiftSettings;
const attendanceModel = (prisma as any).attendanceLog;

const DEFAULT_SHIFT = {
  dayCheckIn: '09:00',
  dayCheckOut: '18:00',
  dayGracePeriod: 15,
  nightCheckIn: '18:00',
  nightCheckOut: '02:00',
  nightGracePeriod: 15,
};

export async function getShiftSettings() {
  let row = await shiftModel.findFirst();
  if (!row) {
    row = await shiftModel.create({
      data: DEFAULT_SHIFT,
    });
  }
  return {
    day: {
      checkIn: row.dayCheckIn,
      checkOut: row.dayCheckOut,
      gracePeriod: row.dayGracePeriod,
    },
    night: {
      checkIn: row.nightCheckIn,
      checkOut: row.nightCheckOut,
      gracePeriod: row.nightGracePeriod,
    },
  };
}

export async function updateShiftSettings(body: {
  day?: { checkIn?: string; checkOut?: string; gracePeriod?: number };
  night?: { checkIn?: string; checkOut?: string; gracePeriod?: number };
}) {
  let row = await shiftModel.findFirst();
  if (!row) {
    row = await shiftModel.create({ data: DEFAULT_SHIFT });
  }
  const data: any = {};
  if (body.day) {
    if (body.day.checkIn !== undefined) data.dayCheckIn = body.day.checkIn;
    if (body.day.checkOut !== undefined) data.dayCheckOut = body.day.checkOut;
    if (body.day.gracePeriod !== undefined) data.dayGracePeriod = body.day.gracePeriod;
  }
  if (body.night) {
    if (body.night.checkIn !== undefined) data.nightCheckIn = body.night.checkIn;
    if (body.night.checkOut !== undefined) data.nightCheckOut = body.night.checkOut;
    if (body.night.gracePeriod !== undefined) data.nightGracePeriod = body.night.gracePeriod;
  }
  const updated = await shiftModel.update({
    where: { id: row.id },
    data,
  });
  return {
    day: { checkIn: updated.dayCheckIn, checkOut: updated.dayCheckOut, gracePeriod: updated.dayGracePeriod },
    night: { checkIn: updated.nightCheckIn, checkOut: updated.nightCheckOut, gracePeriod: updated.nightGracePeriod },
  };
}

export interface LogEntry {
  id: number;
  employeeId?: number;
  employeeName: string;
  day: string;
  shift: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  amountMade: number | null;
  reportPreview: string | null;
  reportId: number;
}

export async function getDailyReportLogs(filters: {
  startDate?: string;
  endDate?: string;
  shift?: string;
  agentId?: number;
}) {
  const where: any = {};
  if (filters.startDate || filters.endDate) {
    where.date = {};
    if (filters.startDate) where.date.gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }
  if (filters.shift) where.shift = filters.shift;
  if (filters.agentId !== undefined) where.userId = filters.agentId;

  const rows = await attendanceModel.findMany({
    where,
    include: { user: { select: { id: true, firstname: true, lastname: true } } },
    orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
    take: 200,
  });

  return rows.map((r: any) => ({
    id: r.id,
    employeeId: r.userId,
    employeeName: r.user ? `${r.user.firstname} ${r.user.lastname}`.trim() : '',
    day: r.date.toISOString().slice(0, 10),
    shift: r.shift,
    date: r.date.toISOString().slice(0, 10),
    checkInTime: r.checkInTime?.toISOString() ?? null,
    checkOutTime: r.checkOutTime?.toISOString() ?? null,
    status: r.status,
    amountMade: r.amountMade ? Number(r.amountMade) : null,
    reportPreview: r.myReport?.slice(0, 100) ?? null,
    reportId: r.id,
  }));
}

export async function getReportById(reportId: number) {
  const log = await attendanceModel.findUnique({
    where: { id: reportId },
    include: { user: { select: { id: true, firstname: true, lastname: true, email: true } } },
  });
  if (!log) return null;
  const checkIn = log.checkInTime;
  const checkOut = log.checkOutTime;
  let activeHours = 0;
  if (checkIn && checkOut) {
    activeHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
  }
  return {
    id: log.id,
    date: log.date,
    agentName: log.user ? `${log.user.firstname} ${log.user.lastname}`.trim() : '',
    position: 'Agent',
    shift: log.shift,
    clockInTime: checkIn?.toISOString() ?? null,
    clockOutTime: checkOut?.toISOString() ?? null,
    activeHours: Math.round(activeHours * 100) / 100,
    totalChatSessions: 0,
    avgResponseTimeSec: 0,
    giftCard: { count: 0, amount: 0 },
    crypto: { count: 0, amount: 0 },
    billPayments: { count: 0, amount: 0 },
    chat: {},
    financials: { amountMade: log.amountMade ? Number(log.amountMade) : 0 },
    status: log.reportStatus,
    myReport: log.myReport,
    auditorsReport: log.auditorsReport,
  };
}

export async function getDailyReportSummary(agentId?: number) {
  const where = agentId !== undefined ? { userId: agentId } : {};
  const logs = await attendanceModel.findMany({
    where,
    orderBy: { date: 'desc' },
    take: 30,
  });
  let activeHours = 0;
  for (const log of logs) {
    if (log.checkInTime && log.checkOutTime) {
      activeHours += (log.checkOutTime.getTime() - log.checkInTime.getTime()) / (1000 * 60 * 60);
    }
  }
  const amountEarned = logs.reduce((s: number, l: any) => s + (l.amountMade ? Number(l.amountMade) : 0), 0);
  return {
    activeHours: Math.round(activeHours * 100) / 100,
    activeHoursTrend: 0,
    amountEarned: Math.round(amountEarned * 100) / 100,
    department: 'Support',
  };
}

export async function getAvgWorkHoursChart(days: number = 7) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const logs = await attendanceModel.findMany({
    where: { date: { gte: start } },
    select: { date: true, checkInTime: true, checkOutTime: true },
  });
  const byDay: Record<string, number> = {};
  for (const log of logs) {
    const day = log.date.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = 0;
    if (log.checkInTime && log.checkOutTime) {
      byDay[day] += (log.checkOutTime.getTime() - log.checkInTime.getTime()) / (1000 * 60 * 60);
    }
  }
  return Object.entries(byDay).map(([day, hours]) => ({ day, hours: Math.round(hours * 100) / 100 }));
}

export async function getWorkHoursPerMonthChart(months: number = 3) {
  const result: { month: string; workHrs: number; overTimeHrs: number }[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const logs = await attendanceModel.findMany({
      where: { date: { gte: d, lte: next } },
      select: { checkInTime: true, checkOutTime: true },
    });
    let workHrs = 0;
    let overTimeHrs = 0;
    for (const log of logs) {
      if (log.checkInTime && log.checkOutTime) {
        const h = (log.checkOutTime.getTime() - log.checkInTime.getTime()) / (1000 * 60 * 60);
        if (h > 8) {
          workHrs += 8;
          overTimeHrs += h - 8;
        } else {
          workHrs += h;
        }
      }
    }
    result.push({
      month: monthKey,
      workHrs: Math.round(workHrs * 100) / 100,
      overTimeHrs: Math.round(overTimeHrs * 100) / 100,
    });
  }
  return result;
}

export async function checkIn(userId: number, shift: string, timestamp?: Date) {
  const ts = timestamp ? new Date(timestamp) : new Date();
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  const existing = await attendanceModel.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (existing) {
    return await attendanceModel.update({
      where: { id: existing.id },
      data: { checkInTime: ts, shift, status: 'checked_in' },
    });
  }
  return await attendanceModel.create({
    data: {
      userId,
      date,
      shift,
      checkInTime: ts,
      status: 'checked_in',
    },
  });
}

export async function checkOut(userId: number, timestamp?: Date) {
  const ts = timestamp ? new Date(timestamp) : new Date();
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  const log = await attendanceModel.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!log) throw new Error('No check-in found for today');
  return await attendanceModel.update({
    where: { id: log.id },
    data: { checkOutTime: ts, status: 'checked_out' },
  });
}

export async function updateReport(
  reportId: number,
  updates: { status?: string; auditorsReport?: string; myReport?: string },
  isAdminOrAuditor: boolean
) {
  const data: any = {};
  if (updates.myReport !== undefined) data.myReport = updates.myReport;
  if (isAdminOrAuditor) {
    if (updates.status !== undefined) data.reportStatus = updates.status;
    if (updates.auditorsReport !== undefined) data.auditorsReport = updates.auditorsReport;
  }
  return await attendanceModel.update({
    where: { id: reportId },
    data,
  });
}
