export interface CalendarHeatmapOptions {
  // Colors
  colorScheme: 'green' | 'blue' | 'red' | 'yellow' | 'purple' | 'orange' | 'custom';
  emptyColor: string;
  customColor: string;

  // Layout
  autoRectSize: boolean;
  rectSize: number;
  space: number;
  radius: number;

  // Labels
  showWeekLabels: boolean;
  showMonthLabels: boolean;
  showLegend: boolean;

  // Data
  aggregation: 'sum' | 'count' | 'avg' | 'max' | 'min' | 'last' | 'first';

  // Interaction
  showTooltip: boolean;
}

export interface HeatmapValue {
  date: string;
  count: number;
}
