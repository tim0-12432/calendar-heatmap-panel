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

  // Week start
  weekStart: 'sunday' | 'monday';

  /**
   * Label display modes:
   * - default: use localized short names (Oct/Nov, Tue/Sun)
   * - number: use numbers (months 01..12, weekdays 1..7)
   * - custom: user provides labels
   */
  monthLabelMode: 'default' | 'number' | 'custom';
  monthLabelCustom: string; // comma-separated 12 labels

  weekLabelMode: 'default' | 'number' | 'custom';
  weekLabelCustom: string; // comma-separated 7 labels

  // Data
  aggregation: 'sum' | 'count' | 'avg' | 'max' | 'min' | 'last' | 'first';

  // Interaction
  showTooltip: boolean;
}

export interface HeatmapValue {
  date: string;
  count: number;
}