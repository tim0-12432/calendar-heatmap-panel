import { dateTime, dateTimeFormat } from '@grafana/data';
import { HeatmapValue } from 'types';

const WEEK_START_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

function getLastWeekStartDate(date: Date, weekStart: 'saturday' | 'sunday' | 'monday'): Date {
  const weekStartIndex = WEEK_START_INDEX[weekStart] ?? 0;
  const dow = date.getDay();
  const offset = (dow - weekStartIndex + 7) % 7;
  return addDays(date, -offset);
}

/**
 * Computes the start date we hand to @uiw/react-heat-map.
 * The library snaps any startDate back to the Sunday on or before it and is
 * DST-safe while doing so since 2.3.4 (it adjusts calendar components instead
 * of subtracting milliseconds, which used to produce a wrong date when the
 * subtraction crossed a DST transition, e.g. 2026-03-29 in Europe). We still
 * pass an explicit local-midnight Sunday so the grid origin is explicit and
 * does not depend on the library's internal normalisation.
 *
 * The caller passes an already render-shifted date (see shiftDates), so here we
 * only snap that date back to the Sunday on or before it. We do NOT snap to the
 * visual week start first — that double-snap can cross a week boundary backwards
 * (up to 7 days too early) and renders an extra empty leading column.
 */
export function getLibraryStartDate(date: Date): Date {
  return getLastWeekStartDate(date, 'sunday');
}

/**
 * End of day (23:59:59.999) in local time. The heat-map library keeps a cell
 * while its local-midnight timestamp is not after endDate, so ending the range
 * at the end of the final day keeps that whole day inside the inclusive range.
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
function formatHeatMapDate(date: Date, timeZone?: string): string {
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
  // Note: @uiw/react-heat-map no longer mutates value[].date in place (since
  // 2.3.4 its formatData copies each entry), so returning the original array
  // here leaves it unchanged for 'sunday' mode. All panel lookups key off
  // `originalDate`, never the shifted `date`.
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

export function toLocalMidnight(ms: number, timeZone?: string): Date {
  const [y, m, d] = formatDate(new Date(ms), timeZone).split(/[/-]/).map(Number);
  return new Date(y, m - 1, d);
}
