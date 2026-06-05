import React, { useMemo, useCallback } from 'react';
import { css } from '@emotion/css';
import { PanelProps } from '@grafana/data';
import { useTheme2, Tooltip } from '@grafana/ui';
import HeatMap from '@uiw/react-heat-map';
import { CalendarHeatmapOptions, HeatmapValue } from '../types';
import { processTimeSeriesData } from '../utils/dataProcessor';
import { getColorPalette } from '../utils/colorHelpers';
import { shiftHeatMapData, splitCsv, shiftDates, rotateWeek, getWeekCount, formatDate, reverseShift } from '../utils/dateHelpers';


interface Props extends PanelProps<CalendarHeatmapOptions> {}

const maxRectSize = 64;
const minRectSize = 8;
const rectSizeBuffer = 0.2;

function getDefaultNumberOrCustom(
  showLabels: boolean,
  labelMode: string,
  customLabels: string,
  defaultLabels: string[]
): string[] | false {
  if (!showLabels) {
    return false as const;
  }

  const defaultLength = defaultLabels.length;

  if (labelMode === 'number') {
    return defaultLabels.map((_, i) => String(i + 1).padStart(2, '0'));
  }

  if (labelMode === 'custom') {
    const custom = splitCsv(customLabels);
    if (custom.length === defaultLength) {
      return custom;
    }
  }

  return defaultLabels;
}

export const CalendarHeatmapPanel: React.FC<Props> = ({ data, width, height, options, timeRange, timeZone, title }) => {
  const theme = useTheme2();

  const heatmapData = useMemo(() => {
    return processTimeSeriesData(data.series, options.aggregation, timeZone);
  }, [data.series, options.aggregation, timeZone]);

  const countByOriginalDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of heatmapData) {
      m.set(d.originalDate, d.count);
    }
    return m;
  }, [heatmapData]);

  const rawStartDate = useMemo(() => new Date(timeRange.from.valueOf()), [timeRange.from]);
  const rawEndDate = useMemo(() => new Date(timeRange.to.valueOf()), [timeRange.to]);

  const availableWidth = useMemo(() => Math.max(0, width - 32), [width]);

  const availableHeight = useMemo(() => {
    const legendHeight = options.showLegend ? 40 : 0;
    const monthLabelHeight = options.showMonthLabels ? 20 : 0;
    return Math.max(0, height - legendHeight - monthLabelHeight);
  }, [height, options.showLegend, options.showMonthLabels]);

  const shiftedHeatmapData: HeatmapValue[] = useMemo(
    () => shiftHeatMapData(options.weekStart, heatmapData, timeZone),
    [heatmapData, options.weekStart, timeZone]
  );

  const [shiftedStartDate, shiftedEndDate] = useMemo(
    () => shiftDates(options.weekStart, [rawStartDate, rawEndDate]),
    [rawStartDate, rawEndDate, options.weekStart]
  );
  const weekCount = useMemo(() => getWeekCount(shiftedStartDate, shiftedEndDate), [shiftedStartDate, shiftedEndDate]);

  const computedRectSize = useMemo(
    () => {
      if (!options.autoRectSize) {
        return options.rectSize;
      }

      const leftPad = options.showWeekLabels ? 28 : 5;
      const usableWidth = Math.max(0, availableWidth - leftPad);
      const maxRectByWidth = Math.floor((usableWidth - (weekCount - 1) * options.space) / weekCount);

      const topBuffer = 20;
      const usableHeight = Math.max(0, availableHeight - topBuffer);
      const maxRectByHeight = Math.floor((usableHeight - 6 * options.space) / 7);

      const raw = Math.min(maxRectByWidth, maxRectByHeight);
      const min = Math.floor(minRectSize * (1 - rectSizeBuffer));
      const max = Math.ceil(maxRectSize * (1 + rectSizeBuffer));
      return Math.max(min, Math.min(max, raw));
    }, [
      options.autoRectSize,
      options.rectSize,
      options.showWeekLabels,
      options.space,
      availableWidth,
      availableHeight,
      weekCount,
    ]
  );

  const weekLabels = useMemo(
    () => {
      const labelsSunFirst = getDefaultNumberOrCustom(
        options.showWeekLabels,
        options.weekLabelMode,
        options.weekLabelCustom,
        [
          t('panel.component.weekLabels.sun', 'Sun'),
          t('panel.component.weekLabels.mon', 'Mon'),
          t('panel.component.weekLabels.tue', 'Tue'),
          t('panel.component.weekLabels.wed', 'Wed'),
          t('panel.component.weekLabels.thu', 'Thu'),
          t('panel.component.weekLabels.fri', 'Fri'),
          t('panel.component.weekLabels.sat', 'Sat'),
        ]
      );
      return labelsSunFirst ? rotateWeek(labelsSunFirst, options.weekStart) : false;
    }, [options.showWeekLabels, options.weekStart, options.weekLabelMode, options.weekLabelCustom]
  );

  const monthLabels = useMemo(
    () => getDefaultNumberOrCustom(
      options.showMonthLabels,
      options.monthLabelMode,
      options.monthLabelCustom,
      [
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
      ]
    ), [options.showMonthLabels, options.monthLabelMode, options.monthLabelCustom]
  );

  const maxValue = useMemo(() => {
    if (heatmapData.length === 0) {
      return 0;
    }
    return Math.max(...heatmapData.map((d) => d.count));
  }, [heatmapData]);

  const colors = useMemo(() => {
    return getColorPalette(options.colorScheme, theme, maxValue, options.emptyColor, options.customColor);
  }, [options.colorScheme, options.emptyColor, options.customColor, theme, maxValue]);

  const styles = useMemo(
    () => ({
      container: css`
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        overflow: auto;
        padding: 16px;
        ${title && 'padding-top: 0;'}
      `,
      heatmap: css`
        --rhm-text-color: ${theme.colors.text.secondary};
        .w-heatmap-week {
          font-size: 11px;
          font-weight: 600;
          fill: currentColor;
        }
        text[data-size] {
          font-size: 12px;
          font-weight: 600;
          fill: currentColor;
        }
        > text.w-heatmap-week {
          transform: translateY(-${computedRectSize/2+options.space/2}px);
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
    }),
    [theme, options.radius, title, options.space, computedRectSize]
  );

  if (data.series.length === 0) {
    return (
      <div className={styles.container}>
        <span className={styles.noData}>{t('panel.component.noData', 'No data available')}</span>
      </div>
    );
  }

  const interpolateLink = (url: string, date: string, value: number): string => {
  return url
    .replace(/\$\{__cell\}/g, date)
    .replace(/\$\{__value\}/g, String(value));
};

const handleCellClick = useCallback((cell: HeatmapValue) => {
  if (!options.dataLinks || options.dataLinks.length === 0) {
    return;
  }
  
  const date = cell.originalDate ?? '';
  const value = cell.count ?? 0;
  
  // Use the first data link for now
  const link = options.dataLinks[0];
  const url = interpolateLink(link.url, date, value);
  
  // Open in new tab for external URLs, or same window for dashboard links
  if (link.target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}, [options.dataLinks]);

  const handleKeyDown = useCallback((event, cell) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleCellClick(cell);
    }
  }, [handleCellClick]);

  return (
    <div className={styles.container}>
      <HeatMap
        className={styles.heatmap}
        value={shiftedHeatmapData}
        startDate={shiftedStartDate}
        endDate={shiftedEndDate}
        width={availableWidth}
        height={availableHeight}
        rectSize={computedRectSize}
        space={options.space}
        radius={options.radius}
        legendCellSize={0}
        weekLabels={weekLabels}
        monthLabels={monthLabels}
        panelColors={colors}
        rectRender={(props, cell) => {
          const typedCell = cell as unknown as HeatmapValue;
          const date = typedCell.originalDate ?? formatDate(reverseShift(options.weekStart, typedCell.date), timeZone);
          const originalCount = countByOriginalDate.get(typedCell.originalDate);
          const tooltipContent =
            originalCount !== undefined
              ? `${date}: ${originalCount.toLocaleString()}`
              : `${date}: ${t('panel.component.tooltip.noData', 'No data')}`;

          const hasLinks = options.dataLinks && options.dataLinks.length > 0;
          const cellDate = typedCell.originalDate ?? formatDate(reverseShift(options.weekStart, typedCell.date), timeZone);
          const cellCount = countByOriginalDate.get(typedCell.originalDate);

          if (!options.showTooltip) {
            return (
              <rect
                {...props}
                rx={options.radius}
                onClick={() => handleCellClick(cell)}
                tabIndex={hasLinks ? 0 : undefined}
                onKeyDown={hasLinks ? (e) => handleKeyDown(e, typedCell) : undefined}
                style={{ cursor: hasLinks ? 'pointer' : 'auto' }}
                aria-label={`${cellDate} (${cellCount ?? 0})`}
              />
            );
          }

          return (
            <Tooltip content={tooltipContent} placement="top">
              <rect
                {...props}
                rx={options.radius}
                onClick={() => handleCellClick(cell)}
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, cell)}
                style={{ cursor: options.dataLinks?.length > 0 ? 'pointer' : 'auto' }}
                aria-label={`${date} (${originalCount ?? 0})`}
              />
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
                title={t('panel.component.legend.tooltip', 'Level {{level}}', { level: key })}
              />
            ))}
          <span>{t('panel.component.legend.more', 'More')}</span>
          {maxValue > 0 && (
            <span style={{ marginLeft: 8 }}>
              ({t('panel.component.legend.max', 'Max')}: {maxValue.toLocaleString()})
            </span>
          )}
        </div>
      )}
    </div>
  );

}(End of file - total 300 lines)