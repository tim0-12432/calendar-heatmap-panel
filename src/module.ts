import { PanelPlugin } from '@grafana/data';
import { CalendarHeatmapPanel } from './components/CalendarHeatmapPanel';
import { CalendarHeatmapOptions } from './types';
import { initPluginTranslations, t } from '@grafana/i18n';
import pluginJson from './plugin.json';
import { calendarHeatmapSuggestionSupplier } from 'utils/suggestionSupplier';

await initPluginTranslations(pluginJson.id);

export const plugin = new PanelPlugin<CalendarHeatmapOptions>(CalendarHeatmapPanel)
  .setSuggestionsSupplier(calendarHeatmapSuggestionSupplier as any)
  .setPanelOptions((builder) => {
    return (
      builder
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
              { value: 'custom', label: t('panel.options.colorScheme.options.custom', 'Custom') },
              { value: 'custom-gradient', label: t('panel.options.colorScheme.options.custom-gradient', 'Custom Gradient') },
            ],
          },
        })
        .addColorPicker({
          path: 'customColor',
          name: t('panel.options.customColor.name', 'Custom Color Theme'),
          description: t(
            'panel.options.customColor.description',
            'Base color for custom palette (other colors will be derived from this)'
          ),
          defaultValue: '#22c55e',
          category: ['Colors'],
          showIf: (options) => options.colorScheme === 'custom',
        })

        // color gradient
        .addColorPicker({
          path: 'gradientColorLow',
          name: t('panel.options.gradientColorLow.name', 'Gradient start color'),
          description: t(
            'panel.options.gradientColorLow.description',
            'Color used for lowest values in the gradient'
          ),
          defaultValue: '#3b82f6',
          category: ['Colors'],
          showIf: (options) => options.colorScheme === 'custom-gradient',
        })
        .addColorPicker({
          path: 'gradientColorHigh',
          name: t('panel.options.gradientColorHigh.name', 'Gradient end color'),
          description: t(
            'panel.options.gradientColorHigh.description',
            'Color used for the higherst values in the gradient'
          ),
          defaultValue: '#ef4444',
          category: ['Colors'],
          showIf: (options) => options.colorScheme === 'custom-gradient',
        })
        .addColorPicker({
          path: 'emptyColor',
          name: t('panel.options.emptyColor.name', 'Empty Color'),
          description: t('panel.options.emptyColor.description', 'Color for days with value 0'),
          category: ['Colors'],
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
            max: 64,
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
            max: 16,
            step: 1,
          },
        })

        // Label settings
        .addBooleanSwitch({
          path: 'showLegend',
          name: t('panel.options.showLegend.name', 'Show Legend'),
          description: t('panel.options.showLegend.description', 'Display color legend'),
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
        .addRadio({
          path: 'monthLabelMode',
          name: t('panel.options.monthLabelMode.name', 'Month Label Mode'),
          description: t('panel.options.monthLabelMode.description', 'How to render month labels'),
          defaultValue: 'default',
          category: ['Labels'],
          settings: {
            options: [
              { value: 'default', label: t('panel.options.monthLabelMode.options.default', 'Default') },
              { value: 'number', label: t('panel.options.monthLabelMode.options.number', 'Number') },
              { value: 'custom', label: t('panel.options.monthLabelMode.options.custom', 'Custom') },
            ],
          },
          showIf: (options) => options.showMonthLabels,
        })
        .addTextInput({
          path: 'monthLabelCustom',
          name: t('panel.options.monthLabelCustom.name', 'Custom Month Labels'),
          description: t(
            'panel.options.monthLabelCustom.description',
            'Comma-separated 12 labels, e.g. Jan,Feb,...,Dec'
          ),
          defaultValue: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
          category: ['Labels'],
          showIf: (o) => o.showMonthLabels && o.monthLabelMode === 'custom',
        })
        .addRadio({
          path: 'weekStart',
          name: t('panel.options.weekStart.name', 'Week Start Day'),
          description: t('panel.options.weekStart.description', 'Choose on which day the week starts'),
          defaultValue: 'sunday',
          category: ['Labels'],
          settings: {
            options: [
              { value: 'saturday', label: t('panel.options.weekStart.options.saturday', 'Saturday') },
              { value: 'sunday', label: t('panel.options.weekStart.options.sunday', 'Sunday') },
              { value: 'monday', label: t('panel.options.weekStart.options.monday', 'Monday') },
            ],
          },
        })
        .addBooleanSwitch({
          path: 'showWeekLabels',
          name: t('panel.options.showWeekLabels.name', 'Show Week Labels'),
          description: t('panel.options.showWeekLabels.description', 'Display day of week labels'),
          defaultValue: true,
          category: ['Labels'],
        })
        .addRadio({
          path: 'weekLabelMode',
          name: t('panel.options.weekLabelMode.name', 'Week Label Mode'),
          description: t('panel.options.weekLabelMode.description', 'How to render week day labels'),
          defaultValue: 'default',
          category: ['Labels'],
          settings: {
            options: [
              { value: 'default', label: t('panel.options.weekLabelMode.options.default', 'Default') },
              { value: 'number', label: t('panel.options.weekLabelMode.options.number', 'Number') },
              { value: 'custom', label: t('panel.options.weekLabelMode.options.custom', 'Custom') },
            ],
          },
          showIf: (o) => o.showWeekLabels,
        })
        .addTextInput({
          path: 'weekLabelCustom',
          name: t('panel.options.weekLabelCustom.name', 'Custom Week Labels'),
          description: t('panel.options.weekLabelCustom.description', 'Comma-separated 7 labels, e.g. Sun,Mon,...,Sat'),
          defaultValue: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
          category: ['Labels'],
          showIf: (o) => o.showWeekLabels && o.weekLabelMode === 'custom',
        })

        // Data settings
        .addSelect({
          path: 'aggregation',
          name: t('panel.options.aggregation.name', 'Aggregation'),
          description: t(
            'panel.options.aggregation.description',
            'How to aggregate multiple data points on the same day'
          ),
          defaultValue: 'sum',
          category: ['Data'],
          settings: {
            options: [
              { value: 'sum', label: t('panel.options.aggregation.options.sum', 'Sum') },
              { value: 'count', label: t('panel.options.aggregation.options.count', 'Count') },
              { value: 'avg', label: t('panel.options.aggregation.options.avg', 'Average') },
              { value: 'max', label: t('panel.options.aggregation.options.max', 'Maximum') },
              { value: 'min', label: t('panel.options.aggregation.options.min', 'Minimum') },
              { value: 'last', label: t('panel.options.aggregation.options.last', 'Last') },
              { value: 'first', label: t('panel.options.aggregation.options.first', 'First') },
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
        })
    );
  })
  .setNoPadding();
