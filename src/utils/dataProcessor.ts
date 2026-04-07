import { DataFrame, FieldType, dateTime, dateTimeFormat } from '@grafana/data';
import { HeatmapValue } from '../types';

type Aggregation = 'sum' | 'count' | 'avg' | 'max' | 'min' | 'last' | 'first';

interface TimestampedValue {
  timestamp: number;
  value: number;
}

export function processTimeSeriesData(
  series: DataFrame[],
  aggregation: Aggregation,
  timeZone?: string
): HeatmapValue[] {
  const dailyData = new Map<string, TimestampedValue[]>();

  for (const frame of series) {
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    const valueField = frame.fields.find((f) => f.type === FieldType.number && f.name !== 'Time');

    if (!timeField || !valueField) {
      continue;
    }

    for (let i = 0; i < frame.length; i++) {
      const timestamp = timeField.values[i];
      const value = valueField.values[i];

      if (value === null || value === undefined || isNaN(value)) {
        continue;
      }

      // Important: format dates using Grafana's timezone to ensure correct bucketing
      const date = dateTimeFormat(dateTime(timestamp), {
        format: 'YYYY/MM/DD',
        timeZone,
      });

      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push({ timestamp, value });
    }
  }

  const result: HeatmapValue[] = [];
  dailyData.forEach((values, date) => {
    const count = aggregate(values, aggregation);
    result.push({ date, count: Math.round(count * 100) / 100 });
  });

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function aggregate(values: TimestampedValue[], method: Aggregation): number {
  if (values.length === 0) {
    return 0;
  }

  switch (method) {
    case 'sum':
      return values.reduce((a, b) => a + b.value, 0);
    case 'count':
      return values.length;
    case 'avg':
      return values.reduce((a, b) => a + b.value, 0) / values.length;
    case 'max':
      return Math.max(...values.map((v) => v.value));
    case 'min':
      return Math.min(...values.map((v) => v.value));
    case 'last':
      return values.reduce((latest, cur) => (cur.timestamp > latest.timestamp ? cur : latest)).value;
    case 'first':
      return values.reduce((earliest, cur) => (cur.timestamp < earliest.timestamp ? cur : earliest)).value;
    default:
      return values[0].value;
  }
}
