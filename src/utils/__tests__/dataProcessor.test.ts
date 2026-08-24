import { createDataFrame, DataFrame, FieldType } from '@grafana/data';
import { processTimeSeriesData } from '../dataProcessor';

function buildFrame(fields: Array<Record<string, unknown>>): DataFrame {
  return createDataFrame({ fields } as never);
}

describe('processTimeSeriesData', () => {
  describe('day bucketing and output sorting', () => {
    it('groups points by formatted date and sorts results by date ascending', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1705237200000, 1705150800000] },
          { name: 'value', type: FieldType.number, values: [1, 2] },
        ]),
      ];
      // 2024-01-14T13:00:00Z and 2024-01-13T13:00:00Z
      const result = processTimeSeriesData(series, 'sum');
      expect(result.map((r) => r.date)).toEqual(['2024/01/13', '2024/01/14']);
      expect(result[0].count).toBe(2);
      expect(result[1].count).toBe(1);
    });

    it('sets originalDate equal to date', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1705237200000] },
          { name: 'value', type: FieldType.number, values: [1] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'sum');
      expect(result).toHaveLength(1);
      expect(result[0].originalDate).toBe(result[0].date);
    });

    it('returns an empty array for empty input', () => {
      expect(processTimeSeriesData([], 'sum')).toEqual([]);
    });
  });

  describe('aggregation methods', () => {
    const baseSeries = () => [
      buildFrame([
        { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
        { name: 'value', type: FieldType.number, values: [4, 8, 6] },
      ]),
    ];

    it('aggregates with sum', () => {
      const result = processTimeSeriesData(baseSeries(), 'sum');
      expect(result[0].count).toBe(18);
    });

    it('aggregates with count', () => {
      const result = processTimeSeriesData(baseSeries(), 'count');
      expect(result[0].count).toBe(3);
    });

    it('aggregates with avg and rounds to 2 decimals', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
          { name: 'value', type: FieldType.number, values: [1, 1, 2] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'avg');
      expect(result[0].count).toBe(1.33);
    });

    it('aggregates with max', () => {
      const result = processTimeSeriesData(baseSeries(), 'max');
      expect(result[0].count).toBe(8);
    });

    it('aggregates with min', () => {
      const result = processTimeSeriesData(baseSeries(), 'min');
      expect(result[0].count).toBe(4);
    });

    it('aggregates with last (by timestamp)', () => {
      const result = processTimeSeriesData(baseSeries(), 'last');
      expect(result[0].count).toBe(6);
    });

    it('aggregates with first (by timestamp)', () => {
      const result = processTimeSeriesData(baseSeries(), 'first');
      expect(result[0].count).toBe(4);
    });

    it('rounds sum to 2 decimals to avoid float artifacts', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'value', type: FieldType.number, values: [0.1, 0.2] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'sum');
      expect(result[0].count).toBe(0.3);
    });
  });

  describe('filtering', () => {
    it('skips null and undefined values', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000, 4000] },
          { name: 'value', type: FieldType.number, values: [null, undefined, 5, 7] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].count).toBe(2);
    });

    it('skips NaN values', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'value', type: FieldType.number, values: [NaN, 5] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].count).toBe(1);
    });

    it('skips null timestamps', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [null, 2000] },
          { name: 'value', type: FieldType.number, values: [5, 5] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].count).toBe(1);
    });

    it('skips points with timestamp === 0 even when the value is valid', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [0, 2000] },
          { name: 'value', type: FieldType.number, values: [42, 5] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].count).toBe(1);
    });
  });

  describe('multi-frame and multi-field input', () => {
    it('combines points from multiple frames into the same bucket', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000] },
          { name: 'value', type: FieldType.number, values: [3] },
        ]),
        buildFrame([
          { name: 'time', type: FieldType.time, values: [2000] },
          { name: 'value', type: FieldType.number, values: [4] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'sum');
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(7);
    });

    it('skips frames without a time field or a usable number field', () => {
      const series = [
        buildFrame([{ name: 'value', type: FieldType.number, values: [1] }]),
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000] },
          { name: 'text', type: FieldType.string, values: ['a'] },
        ]),
        buildFrame([
          { name: 'time', type: FieldType.time, values: [2000] },
          { name: 'value', type: FieldType.number, values: [9] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].count).toBe(1);
    });

    it('picks the first number field whose name is not "Time" (pinned behavior)', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000] },
          { name: 'Time', type: FieldType.number, values: [999] },
          { name: 'first', type: FieldType.number, values: [7] },
          { name: 'second', type: FieldType.number, values: [8] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'sum');
      expect(result[0].count).toBe(7);
      expect(result[0].fieldIndex).toBe(2);
    });
  });

  describe('timezone bucketing', () => {
    // Note: the "default" timezone leg of this test depends on jest.config.js
    // setting TZ=UTC; without that, host-local bucketing could differ from the
    // explicit 'utc' bucketing and break the equality assertion below.
    it('buckets the same instant identically for default and utc when TZ is UTC', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1705323600000] }, // 2024-01-15T13:00:00Z
          { name: 'value', type: FieldType.number, values: [1] },
        ]),
      ];
      const defaultResult = processTimeSeriesData(series, 'sum');
      const utcResult = processTimeSeriesData(series, 'sum', 'utc');
      expect(defaultResult[0].date).toBe('2024/01/15');
      expect(utcResult[0].date).toBe(defaultResult[0].date);
    });

    it('buckets the same instant into a different day under a non-UTC timezone', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1705323600000] }, // 2024-01-15T13:00:00Z
          { name: 'value', type: FieldType.number, values: [1] },
        ]),
      ];
      const utcResult = processTimeSeriesData(series, 'sum', 'utc');
      const kiritimatiResult = processTimeSeriesData(series, 'sum', 'Pacific/Kiritimati'); // UTC+14
      expect(utcResult[0].date).toBe('2024/01/15');
      expect(kiritimatiResult[0].date).toBe('2024/01/16');
    });
  });

  describe('source-row selection for data links', () => {
    it('uses the last point in the bucket as source for sum', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'value', type: FieldType.number, values: [10, 20] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'sum');
      expect(result[0]).toMatchObject({ frameIndex: 0, fieldIndex: 1, rowIndex: 1 });
    });

    it('uses the last point in the bucket as source for count', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'value', type: FieldType.number, values: [10, 20] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'count');
      expect(result[0].rowIndex).toBe(1);
    });

    it('uses the last point in the bucket as source for avg', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'value', type: FieldType.number, values: [10, 20] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'avg');
      expect(result[0].rowIndex).toBe(1);
    });

    it('reports correct frameIndex and fieldIndex across multiple frames', () => {
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000] },
          { name: 'a', type: FieldType.number, values: [1] },
        ]),
        buildFrame([
          { name: 'time', type: FieldType.time, values: [2000] },
          { name: 'b', type: FieldType.number, values: [2] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'max');
      expect(result[0]).toMatchObject({ frameIndex: 1, fieldIndex: 1, rowIndex: 0 });
    });

    it('retains the selected source row when values are duplicated', () => {
      // Values [5, 9, 9]: max is 9, and the selected source is the first maximum.
      const series = [
        buildFrame([
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
          { name: 'value', type: FieldType.number, values: [5, 9, 9] },
        ]),
      ];
      const result = processTimeSeriesData(series, 'max');
      expect(result[0].rowIndex).toBe(1);

      const minResult = processTimeSeriesData(
        [
          buildFrame([
            { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
            { name: 'value', type: FieldType.number, values: [5, 5, 9] },
          ]),
        ],
        'min'
      );
      expect(minResult[0].rowIndex).toBe(0);

      const lastResult = processTimeSeriesData(
        [
          buildFrame([
            { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
            { name: 'value', type: FieldType.number, values: [7, 9, 7] },
          ]),
        ],
        'last'
      );
      expect(lastResult[0].rowIndex).toBe(2);

      const firstResult = processTimeSeriesData(
        [
          buildFrame([
            { name: 'time', type: FieldType.time, values: [2000, 1000, 3000] },
            { name: 'value', type: FieldType.number, values: [5, 5, 9] },
          ]),
        ],
        'first'
      );
      expect(firstResult[0].rowIndex).toBe(1);
    });
  });
});
