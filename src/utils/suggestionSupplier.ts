import { DataFrameType, FieldType, PanelDataSummary, VisualizationSuggestionScore, VisualizationSuggestionsSupplier } from "@grafana/data";
import { CalendarHeatmapOptions } from "types";

export const calendarHeatmapSuggestionSupplier: VisualizationSuggestionsSupplier<CalendarHeatmapOptions, {}> = (dataSummary: PanelDataSummary) => {
    if (
        !dataSummary.hasFieldType(FieldType.time) ||
        !dataSummary.hasFieldType(FieldType.number) ||
        dataSummary.rowCountTotal <= 0
    ) {
        return;
    }

    const score: VisualizationSuggestionScore =
    dataSummary.hasDataFrameType(DataFrameType.TimeSeriesWide) ||
    dataSummary.hasDataFrameType(DataFrameType.TimeSeriesLong)
      ? VisualizationSuggestionScore.Good
      : VisualizationSuggestionScore.OK;

    return [
        {
            name: "Calendar Heatmap",
            score: score,
        }
    ]
}
