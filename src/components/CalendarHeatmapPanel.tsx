import React, { useMemo } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2, Tooltip } from '@grafana/ui';
import HeatMap from '@uiw/react-heat-map';
import { CalendarHeatmapOptions, HeatmapValue } from '../types';
import { processTimeSeriesData } from '../utils/dataProcessor';
import { getColorPalette } from '../utils/colorHelpers';
import { css } from '@emotion/css';
import { t } from '@grafana/i18n';

interface Props extends PanelProps<CalendarHeatmapOptions> {}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Parse either YYYY/MM/DD or YYYY-MM-DD */
function parseAnyYMD(dateStr: string): Date | null {
  const s = String(dateStr).trim();
  const parts = s.includes('/') ? s.split('/') : s.includes('-') ? s.split('-') : [];
  if (parts.length !== 3) {
    return null;
  }
  const [y, m, d] = parts.map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
}

/** Must match dataProcessor.ts formatDate(): YYYY/MM/DD */
function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function splitCsv(input: string): string[] {
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function rotateWeek(labelsSunFirst: string[], weekStart: 'sunday' | 'monday'): string[] {
  // Input is always Sun..Sat
  if (labelsSunFirst.length !== 7) {
    return labelsSunFirst;
  }
  return weekStart === 'monday'
    ? [...labelsSunFirst.slice(1), labelsSunFirst[0]] // Mon..Sat + Sun
    : labelsSunFirst; // Sun..Sat
}

export const CalendarHeatmapPanel: React.FC<Props> = ({ data, width, height, options, timeRange, timeZone, title }) => {
  const theme = useTheme2();

  const heatmapData = useMemo(() => {
    return processTimeSeriesData(data.series, options.aggregation, timeZone);
  }, [data.series, options.aggregation, timeZone]);

  const countByOriginalDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of heatmapData) {
      m.set(d.date, d.count); // keys are YYYY/MM/DD
    }
    return m;
  }, [heatmapData]);

  const rawStartDate = useMemo(() => new Date(timeRange.from.valueOf()), [timeRange.from]);
  const rawEndDate = useMemo(() => new Date(timeRange.to.valueOf()), [timeRange.to]);

  const availableWidth = useMemo(() => Math.max(0, width - 32), [width]);

  // Monday-first: shift render dates by -1 day to rotate weekday rows so Sunday becomes last
  const renderShiftDays = options.weekStart === 'monday' ? -1 : 0;

  const shiftedStartDate = useMemo(() => addDays(rawStartDate, renderShiftDays), [rawStartDate, renderShiftDays]);
  const shiftedEndDate = useMemo(() => addDays(rawEndDate, renderShiftDays), [rawEndDate, renderShiftDays]);

  const shiftedHeatmapData: HeatmapValue[] = useMemo(() => {
    if (renderShiftDays === 0) {
      return heatmapData;
    }

    return heatmapData.map((d) => {
      const dt = parseAnyYMD(d.date);
      if (!dt) {
        return d;
      }
      const shifted = addDays(dt, renderShiftDays);
      return { date: toKey(shifted), count: d.count };
    });
  }, [heatmapData, renderShiftDays]);

  const weekCount = useMemo(() => {
    const alignedStart = !shiftedStartDate.getDay()
      ? shiftedStartDate
      : new Date(shiftedStartDate.getTime() - shiftedStartDate.getDay() * DAY_MS);

    const diffDays = Math.max(0, Math.floor((shiftedEndDate.getTime() - alignedStart.getTime()) / DAY_MS));
    return Math.max(1, Math.ceil((diffDays + 1) / 7));
  }, [shiftedStartDate, shiftedEndDate]);

  const computedRectSize = useMemo(() => {
    if (!options.autoRectSize) {
      return options.rectSize;
    }

    const leftPad = options.showWeekLabels ? 28 : 5;
    const usable = Math.max(0, availableWidth - leftPad);
    const raw = Math.floor(usable / weekCount) - options.space;
    return Math.max(4, Math.min(24, raw));
  }, [options.autoRectSize, options.rectSize, options.showWeekLabels, options.space, availableWidth, weekCount]);

  const weekLabels = useMemo(() => {
    if (!options.showWeekLabels) {
      return false as const;
    }

    // 1) Build base labels in Sun..Sat order
    let labelsSunFirst: string[] | null = null;

    if (options.weekLabelMode === 'number') {
      // Sun..Sat => 1..7 (then rotate by weekStart)
      labelsSunFirst = ['1', '2', '3', '4', '5', '6', '7'];
    } else if (options.weekLabelMode === 'custom') {
      const custom = splitCsv(options.weekLabelCustom);
      labelsSunFirst = custom.length === 7 ? custom : null;
    }

    if (!labelsSunFirst) {
      // default (Sun..Sat)
      labelsSunFirst = [
        t('panel.component.weekLabels.sun', 'Sun'),
        t('panel.component.weekLabels.mon', 'Mon'),
        t('panel.component.weekLabels.tue', 'Tue'),
        t('panel.component.weekLabels.wed', 'Wed'),
        t('panel.component.weekLabels.thu', 'Thu'),
        t('panel.component.weekLabels.fri', 'Fri'),
        t('panel.component.weekLabels.sat', 'Sat'),
      ];
    }

    // 2) Rotate for weekStart (Monday-first => Mon..Sun)
    return rotateWeek(labelsSunFirst, options.weekStart);
  }, [
    options.showWeekLabels,
    options.weekStart,
    options.weekLabelMode,
    options.weekLabelCustom,
  ]);

  const monthLabels = useMemo(() => {
    if (!options.showMonthLabels) {
      return false as const;
    }

    if (options.monthLabelMode === 'number') {
      return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    }

    if (options.monthLabelMode === 'custom') {
      const custom = splitCsv(options.monthLabelCustom);
      if (custom.length === 12) {
        return custom;
      }
      // fall through to default if invalid
    }

    // default
    return [
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
    ];
  }, [options.showMonthLabels, options.monthLabelMode, options.monthLabelCustom]);

  const maxValue = useMemo(() => {
    if (heatmapData.length === 0) {
      return 0;
    }
    return Math.max(...heatmapData.map((d) => d.count));
  }, [heatmapData]);

  const colors = useMemo(() => {
    return getColorPalette(options.colorScheme, theme, maxValue, options.emptyColor, options.customColor);
  }, [options, theme, maxValue]);

  // Styles
  const styles = useMemo(
    () => ({
      container: css`
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: auto;
        padding: 16px;
        /* Remove top padding if title is shown to reduce unnecessary spacing */
        ${title && 'padding-top: 0;'}
      `,
      heatmap: css`
        /* @uiw/react-heat-map sets inline color: var(--rhm-text-color, ...) */
        --rhm-text-color: ${theme.colors.text.secondary};

        /* Ensure heatmap fills the container */
        width: 100%;
        height: 100%;

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
    }),
    [theme, options, title]
  );

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
        value={shiftedHeatmapData}
        startDate={shiftedStartDate}
        endDate={shiftedEndDate}
        width={availableWidth}
        height={height - 80}
        rectSize={computedRectSize}
        space={options.space}
        radius={options.radius}
        legendCellSize={0}
        weekLabels={weekLabels}
        monthLabels={monthLabels}
        panelColors={colors}
        rectRender={(props, cell) => {
          // Convert rendered cell date back to original date for correct tooltip/value
          const renderedDate = parseAnyYMD(cell.date);
          let originalKey = String(cell.date);

          if (renderedDate) {
            const originalDate = addDays(renderedDate, -renderShiftDays); // reverse shift
            originalKey = toKey(originalDate);
          } else {
            originalKey = String(cell.date).replace(/-/g, '/');
          }

          const originalCount = countByOriginalDate.get(originalKey);

          const tooltipContent =
            originalCount !== undefined
              ? `${originalKey}: ${originalCount.toLocaleString()}`
              : `${originalKey}: ${t('panel.component.tooltip.noData', 'No data')}`;

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
};