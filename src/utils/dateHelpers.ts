import { dateTime, dateTimeFormat } from '@grafana/data';
import { HeatmapValue } from 'types';

export function formatDate(date: Date, timeZone?: string): string {
  return dateTimeFormat(dateTime(date), {
    format: 'YYYY/MM/DD',
    timeZone,
  });
}

function addDays(date: Date, days: number): Date {
  return dateTime(date).add(days, 'day').toDate();
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
  const startDt = dateTime(start).startOf('week'); // Aligns to start of week
  const endDt = dateTime(end);
  // Get the difference in weeks and add 1 for inclusive count
  const weeks = Math.max(0, endDt.diff(startDt, 'weeks'));
  return Math.max(1, weeks + 1);
}
