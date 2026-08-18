import { DataFrame, FieldType } from '@grafana/data';
import { HeatmapValue } from '../types';
import { formatDate } from './dateHelpers';

type Aggregation = 'sum' | 'count' | 'avg' | 'max' | 'min' | 'last' | 'first';

interface TimestampedValue {
  timestamp: number;
  value: number;
  idx: number;
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
      const date = formatDate(new Date(timestamp), timeZone);

      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push({ timestamp, value, idx: i });
    }
  }

  const result: HeatmapValue[] = [];
  dailyData.forEach((values, date) => {
    const { count, idx } = aggregate(values, aggregation);
    result.push({
      date,
      count: Math.round(count * 100) / 100,
      originalDate: date,
      rowIndex: idx,
      frameIndex: series.findIndex((frame) => frame.fields.some((f) => f.type === FieldType.time && f.values[idx] === values[idx].timestamp)),
      fieldIndex: series.find((frame) => frame.fields.some((f) => f.type === FieldType.time && f.values[idx] === values[idx].timestamp))?.fields.findIndex((f) => f.type === FieldType.number && f.name !== 'Time') ?? -1
    });
  });

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function aggregate(values: TimestampedValue[], method: Aggregation): { count: number, idx: number } {
  if (values.length === 0) {
    return { count: 0, idx: -1 };
  }

  const lastValIdx = values.length - 1;
  switch (method) {
    case 'sum':
      return { count: values.reduce((a, b) => a + b.value, 0), idx: lastValIdx };
    case 'count':
      return { count: values.length, idx: lastValIdx };
    case 'avg':
      return { count: values.reduce((a, b) => a + b.value, 0) / values.length, idx: lastValIdx };
    case 'max':
      const maxVal = Math.max(...values.map((v) => v.value));
      const maxIdx = values.findIndex((v) => v.value === maxVal);
      return { count: maxVal, idx: maxIdx };
    case 'min':
      const minVal = Math.min(...values.map((v) => v.value));
      const minIdx = values.findIndex((v) => v.value === minVal);
      return { count: minVal, idx: minIdx };
    case 'last':
      const lastVal = values.reduce((latest, cur) => (cur.timestamp > latest.timestamp ? cur : latest)).value;
      const lastIdx = values.findIndex((v) => v.value === lastVal);
      return { count: lastVal, idx: lastIdx };
    case 'first':
      const firstVal = values.reduce((earliest, cur) => (cur.timestamp < earliest.timestamp ? cur : earliest)).value;
      const firstIdx = values.findIndex((v) => v.value === firstVal);
      return { count: firstVal, idx: firstIdx };
    default:
      return { count: values[0].value, idx: 0 };
  }
}
