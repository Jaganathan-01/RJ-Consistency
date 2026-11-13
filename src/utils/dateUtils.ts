import { addDays, differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import type { Commitment } from '../types/models';

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Computes the local wall-clock calendar date (YYYY-MM-DD) and time (HH:mm)
 * in the specified IANA timezone, then applies the dayResetTime boundary.
 */
export function getLogicalDate(
  timestampMs: number,
  timezone: string = getBrowserTimezone(),
  dayResetTime: string = '00:00'
): string {
  const safeTz = isValidTimezone(timezone) ? timezone : 'UTC';
  const date = new Date(timestampMs);

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const localDateStr = dateFormatter.format(date); // YYYY-MM-DD
  const localTimeStr = timeFormatter.format(date); // HH:mm

  const [resetH, resetM] = parseTimeMinutes(dayResetTime);
  const [curH, curM] = parseTimeMinutes(localTimeStr);

  if (curH * 60 + curM < resetH * 60 + resetM) {
    return subDaysFromDateStr(localDateStr, 1);
  }
  return localDateStr;
}

export function getLocalTimeHHMM(
  timestampMs: number,
  timezone: string = getBrowserTimezone()
): string {
  const safeTz = isValidTimezone(timezone) ? timezone : 'UTC';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestampMs));
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseTimeMinutes(hhmm: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '00:00');
  if (!match) return [0, 0];
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return [h, m];
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  return format(addDays(parseISO(dateStr), days), 'yyyy-MM-dd');
}

export function subDaysFromDateStr(dateStr: string, days: number): string {
  return format(subDays(parseISO(dateStr), days), 'yyyy-MM-dd');
}

export function diffDaysBetweenDates(laterDateStr: string, earlierDateStr: string): number {
  return differenceInCalendarDays(parseISO(laterDateStr), parseISO(earlierDateStr));
}

export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  if (startDateStr > endDateStr) return [];
  const result: string[] = [];
  let cursor = startDateStr;
  let guard = 0;
  while (cursor <= endDateStr && guard < 4000) {
    result.push(cursor);
    cursor = addDaysToDateStr(cursor, 1);
    guard++;
  }
  return result;
}

export function getWeekdayIndex(dateStr: string): number {
  return parseISO(dateStr).getDay(); // 0=Sun..6=Sat
}

export function isDateInPauseInterval(commitment: Commitment, dateStr: string): boolean {
  if (!commitment.pauseIntervals || commitment.pauseIntervals.length === 0) {
    return false;
  }
  return commitment.pauseIntervals.some((interval) => {
    const afterStart = dateStr >= interval.fromDate;
    const beforeEnd = !interval.toDate || dateStr <= interval.toDate;
    return afterStart && beforeEnd;
  });
}

export function isScheduledOnDate(commitment: Commitment, dateStr: string): boolean {
  if (dateStr < commitment.schedule.startDate) return false;
  if (commitment.schedule.endDate && dateStr > commitment.schedule.endDate) return false;
  if (isDateInPauseInterval(commitment, dateStr)) return false;

  if (commitment.schedule.type === 'daily') return true;
  const weekday = getWeekdayIndex(dateStr);
  return commitment.schedule.weekdays.includes(weekday);
}

export function formatSecondsClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutesHuman(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDateReadable(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE, MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d');
  } catch {
    return dateStr;
  }
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
