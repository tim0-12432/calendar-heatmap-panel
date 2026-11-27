/**
 * Regression test for bug #89: the heat-map grid was built with plain
 * millisecond arithmetic (`initStartDate.getTime() + oneDayTime * n`), so after
 * the autumn DST transition every cell resolved to 23:00 of the previous local
 * day. The value row shifted one down and one extra cell survived the `endDate`
 * comparison.
 *
 * Runs under TZ=Europe/Berlin (see jest.dst.config.js) because Europe/Berlin
 * still observes DST in 2026: the transition on 2026-10-25 gives a 25 hour day.
 * The default jest config pins TZ=UTC, where the bug is invisible.
 *
 * Failure fingerprint against @uiw/react-heat-map@2.3.3 (what this test must
 * catch): 183 day cells instead of 182, an extra cell in column 26, the
 * 2026-10-27 value one row lower than expected (row 2 instead of row 1),
 * 2026/10/25 rendered twice (index 154 as 00:00 and index 155 as 23:00) and
 * 2026/11/21 rendered in column 26 instead of column 25.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { DataFrame, FieldType, GrafanaTheme2, PanelData, PanelProps } from '@grafana/data';
import { CalendarHeatmapPanel } from 'components/CalendarHeatmapPanel';
import { CalendarHeatmapOptions } from 'types';

const mockTheme = {
  isDark: false,
  colors: {
    text: {
      secondary: 'rgba(204, 204, 220, 0.65)',
    },
    background: {
      canvas: 'rgb(17, 18, 23)',
    },
  },
  visualization: {
    getColorByName: (name: string) => name,
  },
} as unknown as GrafanaTheme2;

// Only theme access and the tooltip are faked: the real Tooltip renders its
// content into a portal on hover, which is not what this test is about.
jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useTheme2: () => mockTheme,
    Tooltip: ({ content, children }: { content: unknown; children: React.ReactElement }) =>
      ReactActual.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'data-tooltip-content': String(content),
      }),
  };
});

const mockRectClientWidth = 329;

const mockOptions: CalendarHeatmapOptions = {
  weekStart: 'monday',
  autoRectSize: false,
  rectSize: 10,
  space: 2,
  radius: 0,
  showWeekLabels: false,
  showMonthLabels: false,
  showLegend: false,
  aggregation: 'sum',
  conversionUnit: 'none',
  useTimeRangeOfData: false,
  showTooltip: true,
  enableDataLinks: false,
  colorScheme: 'green',
  emptyColor: '#ebedf0',
  customColor: '#22c55e',
  gradientColorLow: '#3b82f6',
  gradientColorHigh: '#ef4444',
  monthLabelMode: 'default',
  monthLabelCustom: '',
  weekLabelMode: 'default',
  weekLabelCustom: '',
};

// 2026-10-27 12:00 local time. Grafana serializes time fields as epoch ms.
const mockTimestamp = new Date(2026, 9, 27, 12, 0, 0, 0).getTime();

const mockFrame = {
  name: 'values',
  length: 1,
  fields: [
    {
      name: 'time',
      type: FieldType.time,
      config: {},
      values: [mockTimestamp],
    },
    {
      name: 'value',
      type: FieldType.number,
      config: {},
      values: [7],
    },
  ],
} as unknown as DataFrame;

const panelProps = {
  data: { series: [mockFrame] } as unknown as PanelData,
  width: 361,
  height: 300,
  options: mockOptions,
  timeZone: 'Europe/Berlin',
  timeRange: {
    from: new Date(2026, 4, 25, 0, 0, 0, 0),
    to: new Date(2026, 10, 22, 23, 59, 59, 999),
    raw: { from: '2026-05-25 00:00:00', to: '2026-11-22 23:59:59.999' },
  },
  replaceVariables: (value: string) => value,
} as unknown as PanelProps<CalendarHeatmapOptions>;

function queryCells(container: HTMLElement, date: string): SVGRectElement[] {
  return Array.from(container.querySelectorAll<SVGRectElement>(`rect[data-date="${date}"]`));
}

describe('calendar heatmap across the autumn DST transition', () => {
  let container: HTMLElement;

  beforeAll(() => {
    // Guard: a worker that did not inherit TZ=Europe/Berlin would silently
    // render a DST-free grid and the regression assertions below would be
    // meaningless.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120);

    // jsdom has no layout, so the library's SVG width measurement is stubbed.
    Object.defineProperty(window.SVGElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => mockRectClientWidth,
    });
  });

  afterAll(() => {
    delete (window.SVGElement.prototype as unknown as { clientWidth?: number }).clientWidth;
  });

  beforeEach(() => {
    container = render(<CalendarHeatmapPanel {...panelProps} />).container;
  });

  it('renders exactly one cell per day of the 182 day range', () => {
    // 2026-05-25 .. 2026-11-22 inclusive, render-shifted to a Monday board.
    expect(container.querySelectorAll('rect[data-date]')).toHaveLength(182);
  });

  it('does not render a 27th column', () => {
    // mockRectClientWidth = 329 with rectSize 10 and space 2 gives the library
    // floor((329 - 5) / (10 + 2)) = 27 measured columns (5 = leftPad without week
    // labels), so the library always renders the column 26 group. Asserting the
    // group exists keeps the "no rect in it" check non-vacuous.
    expect(container.querySelector('g[data-column="26"]')).not.toBeNull();
    expect(container.querySelectorAll('g[data-column="26"] rect')).toHaveLength(0);
  });

  it('renders the 25 hour fall-back day once in its own cell', () => {
    // 2026-10-25 is the 25 hour day. @uiw/react-heat-map@2.3.3 stepped cells by
    // 24h of milliseconds, so index 155 resolved to 23:00 of the same local day
    // and the date was emitted twice (index 154 as 00:00, index 155 as 23:00).
    // 2.3.4 steps by calendar day: exactly one cell, at index 154 = 22 * 7 + 0.
    const cells = queryCells(container, '2026/10/25');

    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('data-column')).toBe('22');
    expect(cells[0].getAttribute('data-row')).toBe('0');
    expect(cells[0].getAttribute('x')).toBe('264');
    expect(cells[0].getAttribute('y')).toBe('0');
  });

  it('places the 2026-10-27 value after the DST transition', () => {
    // Stored as 2026/10/26 because the Monday week start shifts cells by -1 day.
    const cells = queryCells(container, '2026/10/26');

    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('data-column')).toBe('22');
    expect(cells[0].getAttribute('data-row')).toBe('1');
    expect(cells[0].getAttribute('x')).toBe('264');
    expect(cells[0].getAttribute('y')).toBe('12');
  });

  it('keeps the original date in the cell tooltip', () => {
    const cells = queryCells(container, '2026/10/26');

    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('data-tooltip-content')).toBe('2026/10/27: 7');
  });

  it('renders the last day once in the last row of column 25', () => {
    const cells = queryCells(container, '2026/11/21');

    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('data-column')).toBe('25');
    expect(cells[0].getAttribute('data-row')).toBe('6');
  });
});
