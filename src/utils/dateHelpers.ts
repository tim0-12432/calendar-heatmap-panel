import { dateTime, dateTimeFormat } from '@grafana/data';
import { HeatmapValue } from 'types';

const WEEK_START_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

export function getLastWeekStartDate(date: Date, weekStart: 'saturday' | 'sunday' | 'monday'): Date {
  const weekStartIndex = WEEK_START_INDEX[weekStart] ?? 0;
  const dow = date.getDay();
  const offset = (dow - weekStartIndex + 7) % 7;
  return addDays(date, -offset);
}

/**
 * Computes the start date we hand to @uiw/react-heat-map.
 * The library internally snaps any non-Sunday startDate back to Sunday using
 * millisecond arithmetic, which produces a wrong date when the subtraction
 * crosses a DST transition (e.g. 2026-03-29 in Europe). By passing an exact
 * Sunday (local midnight) ourselves, the library skips its own snap.
 * Equivalent to the old behavior outside DST: first snap to the visual week
 * start, then snap that day back to Sunday.
 */
export function getLibraryStartDate(date: Date, weekStart: 'saturday' | 'sunday' | 'monday'): Date {
  const weekStartDate = getLastWeekStartDate(date, weekStart);
  return getLastWeekStartDate(weekStartDate, 'sunday');
}

/**
 * End of day (23:59:59.999) in local time. The heat-map library compares cell
 * timestamps against endDate using millisecond math and drifts +1h across a
 * DST transition, which would drop the last day if endDate were midnight.
 */
export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function formatDate(date: Date, timeZone?: string): string {
  return dateTimeFormat(dateTime(date), {
    format: 'YYYY/MM/DD',
    timeZone,
  });
}

/** The heat-map library indexes cells as YYYY/M/D (not YYYY/MM/DD). */
export function formatHeatMapDate(date: Date, timeZone?: string): string {
  const [year, month, day] = formatDate(date, timeZone).split('/');
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

function addDays(date: Date, days: number): Date {
  // Operate on local calendar components directly to avoid DST-related
  // off-by-one errors when the shift crosses a DST transition.
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return new Date(y, m, d + days); // JS Date normalizes day overflow/underflow correctly
}

/** Parse either YYYY/MM/DD or YYYY-MM-DD */
export function parseAnyYMD(dateStr: string): Date | null {
  function tryParse(format: string): Date | null {
    const dt = dateTime(dateStr.trim(), format);
    return dt.isValid() ? dt.toDate() : null;
  }
  return tryParse('YYYY/MM/DD') || tryParse('YYYY-MM-DD');
}

export function splitCsv(input: string): string[] {
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function rotateWeek(labelsSunFirst: string[], weekStart: 'saturday' | 'sunday' | 'monday'): string[] {
  // Input is always Sun..Sat
  if (labelsSunFirst.length !== 7) {
    return labelsSunFirst;
  }
  return weekStart === 'monday'
    ? [...labelsSunFirst.slice(1), labelsSunFirst[0]] // Mon..Sat + Sun
    : weekStart === 'saturday'
      ? [...labelsSunFirst.slice(6), ...labelsSunFirst.slice(0, 6)] // Sat + Sun..Fri
      : labelsSunFirst; // Sun..Sat
}

function getRenderShiftDays(weekStart: 'saturday' | 'sunday' | 'monday'): number {
  return weekStart === 'monday' ? -1 : weekStart === 'saturday' ? 1 : 0;
}

export function reverseShift(weekStart: 'saturday' | 'sunday' | 'monday', date: string): Date {
  const dt = parseAnyYMD(date) || dateTime(date).toDate();
  return addDays(dt, -1 * getRenderShiftDays(weekStart));
}

export function shiftHeatMapData(
  weekstart: 'saturday' | 'sunday' | 'monday',
  heatmapData: HeatmapValue[],
  timeZone?: string
): HeatmapValue[] {
  const renderShiftDays = getRenderShiftDays(weekstart);
  if (renderShiftDays === 0) {
    return heatmapData;
  }
  return heatmapData.map((d) => {
    const dt = parseAnyYMD(d.date);
    if (!dt) {
      return d;
    }
    // Keep originalDate padded for Grafana/data-link lookups, but use the
    // exact key format expected by @uiw/react-heat-map for its cell match.
    return { ...d, date: formatHeatMapDate(addDays(dt, renderShiftDays), timeZone) } as HeatmapValue;
  });
}

export function shiftDates(weekstart: 'saturday' | 'sunday' | 'monday', dates: Date[]): Date[] {
  const renderShiftDays = getRenderShiftDays(weekstart);
  if (renderShiftDays === 0) {
    return dates;
  }
  return dates.map((d) => addDays(d, renderShiftDays));
}

export function getWeekCount(start: Date, end: Date): number {
  const startDt = dateTime(start).startOf('day'); // Aligns to start of week
  const endDt = dateTime(end).startOf('day');
  // Get the difference in weeks and add 1 for inclusive count
  const weeks = Math.max(0, endDt.diff(startDt, 'weeks'));
  return Math.max(1, weeks + 1);
}

export function toLocalMidnight (ms: number, timeZone?: string): Date {
    const [y, m, d] = formatDate(new Date(ms), timeZone).split(/[/-]/).map(Number);
    return new Date(y, m - 1, d);
}
