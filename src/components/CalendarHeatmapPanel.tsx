import React, { useMemo } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2, Tooltip } from '@grafana/ui';
import HeatMap from '@uiw/react-heat-map';
import { CalendarHeatmapOptions } from '../types';
import { processTimeSeriesData, getColorPalette } from '../utils/dataProcessor';
import { css } from '@emotion/css';
import { t } from '@grafana/i18n';

interface Props extends PanelProps<CalendarHeatmapOptions> {}

export const CalendarHeatmapPanel: React.FC<Props> = ({
  data,
  width,
  height,
  options,
  timeRange,
}) => {
  const theme = useTheme2();

  // Process data from Grafana data source
  const heatmapData = useMemo(() => {
    return processTimeSeriesData(data.series, options.aggregation);
  }, [data.series, options.aggregation]);

  // Calculate date range from Grafana time picker
  const startDate = useMemo(() => new Date(timeRange.from.valueOf()), [timeRange.from]);
  const endDate = useMemo(() => new Date(timeRange.to.valueOf()), [timeRange.to]);

  const availableWidth = useMemo(() => Math.max(0, width - 32), [width]);

  const weekCount = useMemo(() => {
    const alignedStart = !startDate.getDay()
      ? startDate
      : new Date(startDate.getTime() - startDate.getDay() * 24 * 60 * 60 * 1000);
    const end = endDate;
    const diffDays = Math.max(0, Math.floor((end.getTime() - alignedStart.getTime()) / (24 * 60 * 60 * 1000)));
    return Math.max(1, Math.ceil((diffDays + 1) / 7));
  }, [startDate, endDate]);

  const computedRectSize = useMemo(() => {
    if (!options.autoRectSize) {
      return options.rectSize;
    }

    const leftPad = options.showWeekLabels ? 28 : 5;
    const usable = Math.max(0, availableWidth - leftPad);
    const raw = Math.floor(usable / weekCount) - options.space;
    return Math.max(4, Math.min(24, raw));
  }, [options.autoRectSize, options.rectSize, options.showWeekLabels, options.space, availableWidth, weekCount]);

  // Calculate max value for legend
  const maxValue = useMemo(() => {
    if (heatmapData.length === 0) {
        return 0;
    }
    return Math.max(...heatmapData.map(d => d.count));
  }, [heatmapData]);

  // Get color palette based on selected scheme
  const colors = useMemo(() => {
    return getColorPalette(options.colorScheme, theme, maxValue);
  }, [options.colorScheme, theme, maxValue]);

  // Styles
  const styles = {
    container: css`
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 16px;
    `,
    heatmap: css`
      /* @uiw/react-heat-map sets inline color: var(--rhm-text-color, ...) */
      --rhm-text-color: ${theme.colors.text.secondary};

      /* Weekday labels */
      .w-heatmap-week {
        font-size: 11px;
        font-weight: 600;
        fill: currentColor;
      }

      /* Month labels have no class, but include a data-size attribute */
      text[data-size] {
        font-size: 12px;
        font-weight: 600;
        fill: currentColor;
      }
    `,
    legend: css`
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      font-size: 11px;
      color: ${theme.colors.text.secondary};
    `,
    legendRect: css`
      width: 12px;
      height: 12px;
      border-radius: calc(${options.radius}px / 2);
    `,
    noData: css`
      color: ${theme.colors.text.secondary};
      font-size: 14px;
    `,
  };

  // Handle empty data
  if (data.series.length === 0) {
    return (
      <div className={styles.container}>
        <span className={styles.noData}>{t('panel.component.noData', 'No data available')}</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <HeatMap
        className={styles.heatmap}
        value={heatmapData}
        startDate={startDate}
        endDate={endDate}
        width={availableWidth}
        height={height - 80}
        rectSize={computedRectSize}
        space={options.space}
        radius={options.radius}
        legendCellSize={0} // We'll render custom legend
        weekLabels={options.showWeekLabels ? [
          t('panel.component.weekLabels.sun', 'Sun'),
          t('panel.component.weekLabels.mon', 'Mon'),
          t('panel.component.weekLabels.tue', 'Tue'),
          t('panel.component.weekLabels.wed', 'Wed'),
          t('panel.component.weekLabels.thu', 'Thu'),
          t('panel.component.weekLabels.fri', 'Fri'),
          t('panel.component.weekLabels.sat', 'Sat'),
        ] : false}
        monthLabels={options.showMonthLabels ? [
          t('panel.component.monthLabels.jan', 'Jan'),
          t('panel.component.monthLabels.feb', 'Feb'),
          t('panel.component.monthLabels.mar', 'Mar'),
          t('panel.component.monthLabels.apr', 'Apr'),
          t('panel.component.monthLabels.may', 'May'),
          t('panel.component.monthLabels.jun', 'Jun'),
          t('panel.component.monthLabels.jul', 'Jul'),
          t('panel.component.monthLabels.aug', 'Aug'),
          t('panel.component.monthLabels.sep', 'Sep'),
          t('panel.component.monthLabels.oct', 'Oct'),
          t('panel.component.monthLabels.nov', 'Nov'),
          t('panel.component.monthLabels.dec', 'Dec'),
        ] : false}
        panelColors={colors}
        rectRender={(props, data) => {
          const tooltipContent = data.count !== undefined 
            ? `${data.date}: ${data.count.toLocaleString()}`
            : `${data.date}: ${t('panel.component.tooltip.noData', 'No data')}`;

          if (!options.showTooltip) {
            return <rect {...props} rx={options.radius} />;
          }

          return (
            <Tooltip content={tooltipContent} placement="top">
              <rect {...props} rx={options.radius} />
            </Tooltip>
          );
        }}
      />

      {options.showLegend && (
        <div className={styles.legend}>
          <span>{t('panel.component.legend.less', 'Less')}</span>
          {Object.entries(colors)
            .map(([key, color]) => [Number(key), color] as const)
            .filter(([key]) => !Number.isNaN(key) && key !== 1)
            .sort(([a], [b]) => a - b)
            .map(([key, color]) => (
            <div
              key={key}
              className={styles.legendRect}
              style={{ backgroundColor: color }}
              title={`Level ${key}`}
            />
            ))}
          <span>{t('panel.component.legend.more', 'More')}</span>
          {maxValue > 0 && <span style={{ marginLeft: 8 }}>({t('panel.component.legend.max', 'Max')}: {maxValue.toLocaleString()})</span>}
        </div>
      )}
    </div>
  );
};
