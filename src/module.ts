import { PanelPlugin } from '@grafana/data';
import { CalendarHeatmapPanel } from './components/CalendarHeatmapPanel';
import { CalendarHeatmapOptions } from './types';

export const plugin = new PanelPlugin<CalendarHeatmapOptions>(
  CalendarHeatmapPanel
)
  .setPanelOptions((builder) => {
    return builder
      // Color settings
      .addSelect({
        path: 'colorScheme',
        name: 'Color Scheme',
        description: 'Color palette for the heatmap',
        defaultValue: 'green',
        category: ['Colors'],
        settings: {
          options: [
            { value: 'green', label: 'Green' },
            { value: 'blue', label: 'Blue' },
            { value: 'red', label: 'Red' },
            { value: 'yellow', label: 'Yellow' },
            { value: 'purple', label: 'Purple' },
            { value: 'orange', label: 'Orange' },
          ],
        },
      })

      // Layout settings
      .addBooleanSwitch({
        path: 'autoRectSize',
        name: 'Auto Cell Size',
        description: 'Automatically fit cells to the panel width',
        defaultValue: true,
        category: ['Layout'],
      })
      .addSliderInput({
        path: 'rectSize',
        name: 'Cell Size',
        description: 'Size of each day cell in pixels',
        defaultValue: 11,
        category: ['Layout'],
        settings: {
          min: 8,
          max: 20,
          step: 1,
        },
      })
      .addSliderInput({
        path: 'space',
        name: 'Cell Spacing',
        description: 'Space between cells in pixels',
        defaultValue: 3,
        category: ['Layout'],
        settings: {
          min: 1,
          max: 24,
          step: 1,
        },
      })
      .addSliderInput({
        path: 'radius',
        name: 'Corner Radius',
        description: 'Border radius of cells',
        defaultValue: 2,
        category: ['Layout'],
        settings: {
          min: 0,
          max: 6,
          step: 1,
        },
      })

      // Label settings
      .addBooleanSwitch({
        path: 'showWeekLabels',
        name: 'Show Week Labels',
        description: 'Display day of week labels',
        defaultValue: true,
        category: ['Labels'],
      })
      .addBooleanSwitch({
        path: 'showMonthLabels',
        name: 'Show Month Labels',
        description: 'Display month labels',
        defaultValue: true,
        category: ['Labels'],
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Show Legend',
        description: 'Display color legend',
        defaultValue: true,
        category: ['Labels'],
      })

      // Data settings
      .addSelect({
        path: 'aggregation',
        name: 'Aggregation',
        description: 'How to aggregate multiple data points on the same day',
        defaultValue: 'sum',
        category: ['Data'],
        settings: {
          options: [
            { value: 'sum', label: 'Sum' },
            { value: 'count', label: 'Count' },
            { value: 'avg', label: 'Average' },
            { value: 'max', label: 'Maximum' },
            { value: 'min', label: 'Minimum' },
          ],
        },
      })

      // Interaction
      .addBooleanSwitch({
        path: 'showTooltip',
        name: 'Show Tooltip',
        description: 'Show tooltip on hover',
        defaultValue: true,
        category: ['Interaction'],
      });
  })
  .setNoPadding();
