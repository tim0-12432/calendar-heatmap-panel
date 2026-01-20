import { DataFrame, FieldType, GrafanaTheme2 } from '@grafana/data';
import { HeatmapValue } from '../types';

type Aggregation = 'sum' | 'count' | 'avg' | 'max' | 'min';

export function processTimeSeriesData(
  series: DataFrame[],
  aggregation: Aggregation
): HeatmapValue[] {
  const dailyData = new Map<string, number[]>();

  // Iterate through all data frames
  for (const frame of series) {
    const timeField = frame.fields.find(f => f.type === FieldType.time);
    const valueField = frame.fields.find(
      f => f.type === FieldType.number && f.name !== 'Time'
    );

    if (!timeField || !valueField) {
      continue;
    }

    // Group values by date
    for (let i = 0; i < frame.length; i++) {
      const timestamp = timeField.values[i];
      const value = valueField.values[i];

      if (value === null || value === undefined || isNaN(value)) {
        continue;
      }

      const date = formatDate(new Date(timestamp));

      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push(value);
    }
  }

  // Apply aggregation
  const result: HeatmapValue[] = [];

  dailyData.forEach((values, date) => {
    const count = aggregate(values, aggregation);
    result.push({ date, count: Math.round(count * 100) / 100 });
  });

  // Sort by date
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

function aggregate(values: number[], method: Aggregation): number {
  if (values.length === 0) {
    return 0;
  }

  switch (method) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'count':
      return values.length;
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

export function getColorPalette(
  scheme: string,
  theme: GrafanaTheme2,
  maxCount: number
): Record<number, string> {
  const emptyColor = theme.colors.background.canvas;
  const supportedSchemes = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);
  const hue = supportedSchemes.has(scheme) ? scheme : 'green';

  // @uiw/react-heat-map chooses the first threshold strictly greater than `count`.
  // That means a `count` of 0 would otherwise take the first non-zero bucket color.
  // Adding a `1: emptyColor` threshold makes 0 render as empty.
  const emptyUpperBound = 1;

  // Always expose 4 non-empty shades, regardless of maxCount, to keep the legend stable.
  // We generate strictly increasing *exclusive upper bounds* for the 4 shade buckets.
  const safeMax = Number.isFinite(maxCount) ? Math.max(0, Math.ceil(maxCount)) : 0;
  const shadeQuantiles = [0.25, 0.5, 0.75, 1];
  let shades = ['super-light', 'light', 'semi-dark', 'dark'];
  if (theme.isDark) {
    shades = Array.from(shades).reverse();
  }

  const palette: Record<number, string> = {
    0: emptyColor,
    [emptyUpperBound]: emptyColor,
  };

  let prev = emptyUpperBound;
  for (let i = 0; i < shadeQuantiles.length; i++) {
    // desired is (inclusive cutoff) + 1 to make it an exclusive upper bound
    const desired = Math.round(safeMax * shadeQuantiles[i]) + 1;
    const bound = Math.max(prev + 1, Math.max(2, desired));
    palette[bound] = theme.visualization.getColorByName(`${shades[i]}-${hue}`);
    prev = bound;
  }

  return palette;
}
