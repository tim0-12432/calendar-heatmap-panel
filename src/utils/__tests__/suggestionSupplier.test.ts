import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { calendarHeatmapSuggestionSupplier } from '../suggestionSupplier';

describe('calendarHeatmapSuggestionSupplier', () => {
  it('returns void when there is no time field', () => {
    const result = calendarHeatmapSuggestionSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [{ name: 'value', type: FieldType.number, values: [1, 2, 3] }],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns suggestions for time + number data', () => {
    const result = calendarHeatmapSuggestionSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100, 200] },
            { name: 'value', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('Calendar Heatmap');
  });

  it('scores Good for explicit time series frame types', () => {
    const result = calendarHeatmapSuggestionSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.TimeSeriesWide },
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100, 200] },
            { name: 'value', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );
    expect(result![0].score).toBe(VisualizationSuggestionScore.Good);
  });
});
