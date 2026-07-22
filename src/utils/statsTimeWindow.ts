/**
 * Resolves admin dashboard time-window presets to UTC date ranges.
 * dayShift: 08:00–20:00 local time (current or most recent window)
 * nightShift: 20:00–08:00 local time (spans midnight)
 */
export type StatsTimeWindow = 'all' | 'last12hrs' | 'dayShift' | 'nightShift';

export function resolveStatsTimeWindow(
  timeWindow?: string
): { gte?: Date; lte?: Date } {
  if (!timeWindow || timeWindow === 'all') return {};

  const now = new Date();

  if (timeWindow === 'last12hrs') {
    return {
      gte: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      lte: now,
    };
  }

  if (timeWindow === 'dayShift') {
    const gte = new Date(now);
    gte.setHours(8, 0, 0, 0);
    const end = new Date(now);
    end.setHours(20, 0, 0, 0);
    if (now < gte) {
      gte.setDate(gte.getDate() - 1);
      end.setDate(end.getDate() - 1);
    }
    return { gte, lte: now < end ? now : end };
  }

  if (timeWindow === 'nightShift') {
    const gte = new Date(now);
    const lte = new Date(now);
    const hour = now.getHours();

    if (hour >= 20) {
      gte.setHours(20, 0, 0, 0);
      return { gte, lte: now };
    }
    if (hour < 8) {
      gte.setDate(gte.getDate() - 1);
      gte.setHours(20, 0, 0, 0);
      return { gte, lte: now };
    }
    gte.setDate(gte.getDate() - 1);
    gte.setHours(20, 0, 0, 0);
    lte.setHours(8, 0, 0, 0);
    return { gte, lte };
  }

  return {};
}

export function statsTimeWindowToIsoRange(
  timeWindow?: string
): { startDate?: string; endDate?: string } {
  const { gte, lte } = resolveStatsTimeWindow(timeWindow);
  if (!gte && !lte) return {};
  return {
    startDate: gte?.toISOString(),
    endDate: lte?.toISOString(),
  };
}
