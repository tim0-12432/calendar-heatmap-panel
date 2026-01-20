import { PanelPlugin } from '@grafana/data';
import { CalendarHeatmapPanel } from './components/CalendarHeatmapPanel';
import { CalendarHeatmapOptions } from './types';
import { initPluginTranslations, t } from '@grafana/i18n';
import pluginJson from './plugin.json';

await initPluginTranslations(pluginJson.id);

export const plugin = new PanelPlugin<CalendarHeatmapOptions>(
  CalendarHeatmapPanel
)
  .setPanelOptions((builder) => {
    return builder
      // Color settings
      .addSelect({
        path: 'colorScheme',
        name: t('panel.options.colorScheme.name', 'Color Scheme'),
        description: t('panel.options.colorScheme.description', 'Color palette for the heatmap'),
        defaultValue: 'green',
        category: ['Colors'],
        settings: {
          options: [
            { value: 'green', label: t('panel.options.colorScheme.options.green', 'Green') },
            { value: 'blue', label: t('panel.options.colorScheme.options.blue', 'Blue') },
            { value: 'red', label: t('panel.options.colorScheme.options.red', 'Red') },
            { value: 'yellow', label: t('panel.options.colorScheme.options.yellow', 'Yellow') },
            { value: 'purple', label: t('panel.options.colorScheme.options.purple', 'Purple') },
            { value: 'orange', label: t('panel.options.colorScheme.options.orange', 'Orange') },
          ],
        },
      })

      // Layout settings
      .addBooleanSwitch({
        path: 'autoRectSize',
        name: t('panel.options.autoRectSize.name', 'Auto Cell Size'),
        description: t('panel.options.autoRectSize.description', 'Automatically fit cells to the panel width'),
        defaultValue: true,
        category: ['Layout'],
      })
      .addSliderInput({
        path: 'rectSize',
        name: t('panel.options.rectSize.name', 'Cell Size'),
        description: t('panel.options.rectSize.description', 'Size of each day cell in pixels'),
        defaultValue: 11,
        category: ['Layout'],
        settings: {
          min: 8,
          max: 20,
          step: 1,
        },
        showIf: (options) => !options.autoRectSize,
      })
      .addSliderInput({
        path: 'space',
        name: t('panel.options.space.name', 'Cell Spacing'),
        description: t('panel.options.space.description', 'Space between cells in pixels'),
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
        name: t('panel.options.radius.name', 'Corner Radius'),
        description: t('panel.options.radius.description', 'Border radius of cells'),
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
        name: t('panel.options.showWeekLabels.name', 'Show Week Labels'),
        description: t('panel.options.showWeekLabels.description', 'Display day of week labels'),
        defaultValue: true,
        category: ['Labels'],
      })
      .addBooleanSwitch({
        path: 'showMonthLabels',
        name: t('panel.options.showMonthLabels.name', 'Show Month Labels'),
        description: t('panel.options.showMonthLabels.description', 'Display month labels'),
        defaultValue: true,
        category: ['Labels'],
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: t('panel.options.showLegend.name', 'Show Legend'),
        description: t('panel.options.showLegend.description', 'Display color legend'),
        defaultValue: true,
        category: ['Labels'],
      })

      // Data settings
      .addSelect({
        path: 'aggregation',
        name: t('panel.options.aggregation.name', 'Aggregation'),
        description: t('panel.options.aggregation.description', 'How to aggregate multiple data points on the same day'),
        defaultValue: 'sum',
        category: ['Data'],
        settings: {
          options: [
            { value: 'sum', label: t('panel.options.aggregation.options.sum', 'Sum') },
            { value: 'count', label: t('panel.options.aggregation.options.count', 'Count') },
            { value: 'avg', label: t('panel.options.aggregation.options.avg', 'Average') },
            { value: 'max', label: t('panel.options.aggregation.options.max', 'Maximum') },
            { value: 'min', label: t('panel.options.aggregation.options.min', 'Minimum') },
          ],
        },
      })

      // Interaction
      .addBooleanSwitch({
        path: 'showTooltip',
        name: t('panel.options.showTooltip.name', 'Show Tooltip'),
        description: t('panel.options.showTooltip.description', 'Show tooltip on hover'),
        defaultValue: true,
        category: ['Interaction'],
      });
  })
  .setNoPadding();
