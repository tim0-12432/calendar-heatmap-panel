import { dateTime, dateTimeFormat } from '@grafana/data';
import { HeatmapValue } from 'types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDate(date: Date, timeZone?: string): string {
  return dateTimeFormat(dateTime(date), {
    format: 'YYYY/MM/DD',
    timeZone,
  });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Parse either YYYY/MM/DD or YYYY-MM-DD */
export function parseAnyYMD(dateStr: string): Date | null {
  const s = String(dateStr).trim();
  const parts = s.includes('/') ? s.split('/') : s.includes('-') ? s.split('-') : [];
  if (parts.length !== 3) {
    return null;
  }
  const [y, m, d] = parts.map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
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
  let dt = parseAnyYMD(date);
  if (!dt) {
    dt = new Date(date);
  }
  const renderShiftDays = -1 * getRenderShiftDays(weekStart);
  return addDays(dt, renderShiftDays);
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
    const shifted = formatDate(addDays(dt, renderShiftDays), timeZone);
    return { date: shifted, originalDate: d.originalDate, count: d.count } as HeatmapValue;
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
  const alignedStart = !start.getDay() ? start : new Date(start.getTime() - start.getDay() * DAY_MS);

  const diffDays = Math.max(0, Math.floor((end.getTime() - alignedStart.getTime()) / DAY_MS));
  return Math.max(1, Math.ceil((diffDays + 1) / 7));
}
