import {
  formatDate,
  parseAnyYMD,
  splitCsv,
  rotateWeek,
  reverseShift,
  shiftHeatMapData,
  shiftDates,
  getWeekCount,
  getLastWeekStartDate,
  getLibraryStartDate,
  endOfDay,
} from '../dateHelpers';
import { HeatmapValue } from '../../types';

describe('dateHelpers', () => {
  const localNoon = (year: number, monthIndex: number, day: number): Date =>
    new Date(year, monthIndex, day, 12, 0, 0, 0);

  describe('formatDate', () => {
    it('formats date as YYYY/MM/DD', () => {
      const date = new Date('2024-06-15T12:00:00.000Z');

      expect(formatDate(date, 'UTC')).toBe('2024/06/15');
    });

    it('supports explicit timezone formatting', () => {
      const date = new Date('2024-01-01T00:30:00.000Z');

      expect(formatDate(date, 'America/New_York')).toBe('2023/12/31');
      expect(formatDate(date, 'UTC')).toBe('2024/01/01');
    });
  });

  describe('parseAnyYMD', () => {
    it('parses YYYY/MM/DD and YYYY-MM-DD', () => {
      const slash = parseAnyYMD('2024/03/09');
      const dash = parseAnyYMD('2024-03-09');

      expect(slash).toBeTruthy();
      expect(dash).toBeTruthy();
      expect(formatDate(slash as Date)).toBe('2024/03/09');
      expect(formatDate(dash as Date)).toBe('2024/03/09');
    });

    it('trims input before parsing', () => {
      const parsed = parseAnyYMD('   2024-03-09   ');

      expect(parsed).toBeTruthy();
      expect(formatDate(parsed as Date)).toBe('2024/03/09');
    });

    it('returns null for invalid strings', () => {
      expect(parseAnyYMD('not-a-date')).toBeNull();
      expect(parseAnyYMD('2024/13/40')).toBeNull();
      expect(parseAnyYMD('')).toBeNull();
    });
  });

  describe('splitCsv', () => {
    it('splits comma-separated values and trims entries', () => {
      expect(splitCsv(' Sun, Mon ,Tue ')).toEqual(['Sun', 'Mon', 'Tue']);
    });

    it('drops empty entries', () => {
      expect(splitCsv('a,, ,b,')).toEqual(['a', 'b']);
    });

    it('handles non-string inputs via String conversion', () => {
      expect(splitCsv(String(123))).toEqual(['123']);
    });
  });

  describe('rotateWeek', () => {
    const sunFirst = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    it('keeps Sunday-first unchanged for sunday mode', () => {
      expect(rotateWeek(sunFirst, 'sunday')).toEqual(sunFirst);
    });

    it('rotates to Monday-first for monday mode', () => {
      expect(rotateWeek(sunFirst, 'monday')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('rotates to Saturday-first for saturday mode', () => {
      expect(rotateWeek(sunFirst, 'saturday')).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    });

    it('returns input unchanged if label count is not 7', () => {
      const invalid = ['Sun', 'Mon'];

      expect(rotateWeek(invalid, 'monday')).toBe(invalid);
    });
  });

  describe('reverseShift', () => {
    it('reverses monday render shift by adding one day back', () => {
      const reversed = reverseShift('monday', '2024/03/10');

      expect(formatDate(reversed)).toBe('2024/03/11');
    });

    it('reverses saturday render shift by subtracting one day', () => {
      const reversed = reverseShift('saturday', '2024/03/10');

      expect(formatDate(reversed)).toBe('2024/03/09');
    });

    it('keeps date unchanged for sunday mode', () => {
      const reversed = reverseShift('sunday', '2024/03/10');

      expect(formatDate(reversed)).toBe('2024/03/10');
    });

    it('falls back to generic date parsing when input is not YMD', () => {
      const reversed = reverseShift('sunday', '2024-03-10T10:00:00.000Z');

      expect(formatDate(reversed, 'UTC')).toBe('2024/03/10');
    });
  });

  describe('shiftHeatMapData', () => {
    const sample: HeatmapValue[] = [
      { date: '2024/03/10', originalDate: '2024/03/10', count: 2 },
      { date: 'invalid-date', originalDate: 'invalid-date', count: 3 },
    ];

    it('returns same array reference for sunday mode', () => {
      const shifted = shiftHeatMapData('sunday', sample);

      expect(shifted).toBe(sample);
    });

    it('shifts valid dates by -1 day for monday mode and keeps invalid entries unchanged', () => {
      const shifted = shiftHeatMapData('monday', sample, 'UTC');

      expect(shifted).toHaveLength(2);
      expect(shifted[0]).toEqual({
        date: '2024/03/09',
        originalDate: '2024/03/10',
        count: 2,
      });
      expect(shifted[1]).toBe(sample[1]);
    });

    it('shifts valid dates by +1 day for saturday mode', () => {
      const shifted = shiftHeatMapData('saturday', sample, 'UTC');

      expect(shifted[0]).toEqual({
        date: '2024/03/11',
        originalDate: '2024/03/10',
        count: 2,
      });
    });
  });

  describe('shiftDates', () => {
    const start = localNoon(2024, 2, 10);
    const end = localNoon(2024, 2, 12);

    it('returns same array reference for sunday mode', () => {
      const dates = [start, end];
      const shifted = shiftDates('sunday', dates);

      expect(shifted).toBe(dates);
    });

    it('applies monday shift (-1 day)', () => {
      const shifted = shiftDates('monday', [start, end]);

      expect(shifted.map((d) => formatDate(d))).toEqual(['2024/03/09', '2024/03/11']);
    });

    it('applies saturday shift (+1 day)', () => {
      const shifted = shiftDates('saturday', [start, end]);

      expect(shifted.map((d) => formatDate(d))).toEqual(['2024/03/11', '2024/03/13']);
    });
  });

  describe('getWeekCount', () => {
    it('returns at least 1 for same day range', () => {
      const d = localNoon(2024, 2, 10);

      expect(getWeekCount(d, d)).toBe(1);
    });

    it('returns 2 for dates spanning into next week', () => {
      const start = localNoon(2024, 2, 10);
      const end = localNoon(2024, 2, 17);

      expect(getWeekCount(start, end)).toBe(2);
    });

    it('returns 1 when end is before start after clamping', () => {
      const start = localNoon(2024, 2, 10);
      const end = localNoon(2024, 2, 1);

      expect(getWeekCount(start, end)).toBe(1);
    });
  });

  describe('getLibraryStartDate (DST fix)', () => {
    const weekStarts: Array<'saturday' | 'sunday' | 'monday'> = ['saturday', 'sunday', 'monday'];

    it('always returns a Sunday for all weekStart values and DST-relevant inputs', () => {
      const inputs = [
        new Date(2026, 3, 1), // Wed Apr 1
        new Date(2026, 2, 29), // Sun Mar 29 (EU DST spring-forward)
        new Date(2026, 2, 28), // Sat Mar 28
        new Date(2026, 2, 30), // Mon Mar 30
      ];

      for (const input of inputs) {
        for (const weekStart of weekStarts) {
          const result = getLibraryStartDate(input, weekStart);
          expect(result.getDay()).toBe(0);
        }
      }
    });

    it('matches old library snap behavior outside DST for monday and saturday', () => {
      const farFromDst = new Date(2026, 0, 21); // Wed Jan 21 2026

      for (const weekStart of ['monday', 'saturday'] as const) {
        const old = getLastWeekStartDate(farFromDst, weekStart);
        const snapped = new Date(old.getTime() - old.getDay() * 86400000);
        const oldNormalized = new Date(snapped.getFullYear(), snapped.getMonth(), snapped.getDate());
        const newResult = getLibraryStartDate(farFromDst, weekStart);
        expect(oldNormalized.getTime()).toBe(newResult.getTime());
      }
    });

    it('returns 2026-03-29 (not 2026-03-28) for Apr 1 input with monday weekStart', () => {
      const result = getLibraryStartDate(new Date(2026, 3, 1), 'monday');

      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(29);
    });
  });

  describe('endOfDay', () => {
    it('preserves year/month/date and returns 23:59:59.999 local', () => {
      const d = new Date(2026, 2, 29);
      const result = endOfDay(d);

      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it('is greater than early-morning same-day for DST-tolerance', () => {
      const d = new Date(2026, 2, 29);

      expect(endOfDay(d).getTime()).toBeGreaterThan(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 1).getTime());
    });
  });
});
