import { DataFrame, FieldType } from '@grafana/data';
import { HeatmapValue } from '../types';
import { formatDate } from './dateHelpers';

type Aggregation = 'sum' | 'count' | 'avg' | 'max' | 'min' | 'last' | 'first';

interface TimestampedValue {
  timestamp: number;
  value: number;
  rowIndex: number;
  frameIndex: number;
  fieldIndex: number;
}

export function processTimeSeriesData(
  series: DataFrame[],
  aggregation: Aggregation,
  timeZone?: string
): HeatmapValue[] {
  const dailyData = new Map<string, TimestampedValue[]>();

  for (let frameIndex = 0; frameIndex < series.length; frameIndex++) {
    const frame = series[frameIndex];
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    const fieldIndex = frame.fields.findIndex(
      (f) => f.type === FieldType.number && f.name !== 'Time'
    );
    if (!timeField || fieldIndex === -1) {
      continue;
    }
    const valueField = frame.fields[fieldIndex];

    for (let i = 0; i < frame.length; i++) {
      const timestamp = timeField.values[i];
      if (timestamp === null || timestamp === undefined || timestamp === 0) {
        continue;
      }
      const value = valueField.values[i];
      if (value === null || value === undefined || isNaN(value)) {
        continue;
      }
      const date = formatDate(new Date(timestamp), timeZone);
      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push({ timestamp, value, rowIndex: i, frameIndex, fieldIndex });
    }
  }

  const result: HeatmapValue[] = [];
  dailyData.forEach((values, date) => {
    const { count, source } = aggregate(values, aggregation);
    result.push({
      date,
      count: Math.round(count * 100) / 100,
      originalDate: date,
      rowIndex: source?.rowIndex,
      frameIndex: source?.frameIndex,
      fieldIndex: source?.fieldIndex
    });
  });

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function aggregate(values: TimestampedValue[], method: Aggregation): { count: number, source?: TimestampedValue } {
  if (values.length === 0) {
    return { count: 0, source: undefined };
  }

  const lastValIdx = values.length - 1;
  switch (method) {
    case 'sum':
      return { count: values.reduce((a, b) => a + b.value, 0), source: values[lastValIdx] };
    case 'count':
      return { count: values.length, source: values[lastValIdx] };
    case 'avg':
      return { count: values.reduce((a, b) => a + b.value, 0) / values.length, source: values[lastValIdx] };
    case 'max':
      const max = values.reduce((highest, cur) => (cur.value > highest.value ? cur : highest));
      return { count: max.value, source: max };
    case 'min':
      const min = values.reduce((lowest, cur) => (cur.value < lowest.value ? cur : lowest));
      return { count: min.value, source: min };
    case 'last':
      const last = values.reduce((latest, cur) => (cur.timestamp > latest.timestamp ? cur : latest));
      return { count: last.value, source: last };
    case 'first':
      const first = values.reduce((earliest, cur) => (cur.timestamp < earliest.timestamp ? cur : earliest));
      return { count: first.value, source: first };
    default:
      return { count: values[0].value, source: values[0] };
  }
}
