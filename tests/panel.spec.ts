import { expect, test, type PanelEditPage } from '@grafana/plugin-e2e';
import type { APIRequestContext } from '@playwright/test';

const DASHBOARD_FILE = 'dashboard.json';
const PANEL_WITH_DATA_ID = '1';
const PANEL_NO_DATA_ID = '2';
const EXPECT_TIMEOUT = 15_000;
const PANEL_READY_TIMEOUT = 20_000;
const HEATMAP_SELECTOR = 'svg.w-heatmap';
const HEATMAP_CELL_SELECTOR = 'rect[data-date]';
const WEEK_LABEL_SELECTOR = `${HEATMAP_SELECTOR} .w-heatmap-week`;
const MONTH_LABEL_SELECTOR = `${HEATMAP_SELECTOR} text[data-size]`;

type PanelDeps = {
  readProvisionedDashboard: (args: { fileName: string }) => Promise<unknown>;
  gotoPanelEditPage: (args: { dashboard?: any; id: string }) => Promise<PanelEditPage>;
  request: APIRequestContext;
};

type HeatmapCellFill = {
  date: string;
  fill: string;
};

type PanelOptionsOverrides = Record<string, unknown>;

type DashboardPanel = {
  id?: number | string;
  options?: Record<string, unknown>;
};

type ProvisionedDashboard = {
  id?: number;
  uid?: string;
  title?: string;
  version?: number;
  panels?: DashboardPanel[];
  [key: string]: unknown;
};

const tempDashboardUids = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepCloneProvisionedDashboard(dashboard: unknown): ProvisionedDashboard {
  return JSON.parse(JSON.stringify(dashboard)) as ProvisionedDashboard;
}

function mergeOptions(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const existingValue = merged[key];

    if (isRecord(existingValue) && isRecord(value)) {
      merged[key] = mergeOptions(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function applyPanelOptionsOverrides(
  dashboard: ProvisionedDashboard,
  panelId: string,
  overrides: PanelOptionsOverrides
) {
  if (!Array.isArray(dashboard.panels)) {
    throw new Error('Provisioned dashboard does not contain a panels array.');
  }

  const panel = dashboard.panels.find((candidate) => String(candidate.id) === panelId);
  if (!panel) {
    throw new Error(`Could not find panel with id "${panelId}" in provisioned dashboard.`);
  }

  const currentOptions = isRecord(panel.options) ? panel.options : {};
  panel.options = mergeOptions(currentOptions, overrides);
}

function createTempDashboardUid(baseUid: string): string {
  const uidPrefix = baseUid
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  const normalizedPrefix = uidPrefix || 'calendar-heatmap-e2e';
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const maxPrefixLength = Math.max(1, 40 - uniqueSuffix.length - 1);

  return `${normalizedPrefix.slice(0, maxPrefixLength)}-${uniqueSuffix}`;
}

async function createTemporaryDashboardWithOverrides(args: {
  panelId: string;
  overrides: PanelOptionsOverrides;
  provisionedDashboard: unknown;
  request: APIRequestContext;
}): Promise<string> {
  const { panelId, overrides, provisionedDashboard, request } = args;

  const dashboard = deepCloneProvisionedDashboard(provisionedDashboard);
  applyPanelOptionsOverrides(dashboard, panelId, overrides);

  const baseUid = typeof dashboard.uid === 'string' && dashboard.uid.length > 0 ? dashboard.uid : 'calendar-heatmap';
  const tempUid = createTempDashboardUid(baseUid);
  const baseTitle =
    typeof dashboard.title === 'string' && dashboard.title.length > 0
      ? dashboard.title
      : 'Calendar Heatmap Temporary Dashboard';

  dashboard.uid = tempUid;
  dashboard.title = `${baseTitle} (temp ${tempUid})`;
  delete dashboard.id;
  delete dashboard.version;

  const createResponse = await request.post('/api/dashboards/db', {
    data: {
      dashboard,
      folderId: 0,
      overwrite: false,
    },
  });

  if (!createResponse.ok()) {
    const body = await createResponse.text();
    throw new Error(
      `Failed to create temporary dashboard for panel ${panelId}: ${createResponse.status()} ${createResponse.statusText()} ${body}`
    );
  }

  const payload = (await createResponse.json()) as unknown;
  if (!isRecord(payload) || typeof payload.uid !== 'string' || payload.uid.length === 0) {
    throw new Error('Grafana dashboard create API response did not include a dashboard uid.');
  }

  return payload.uid;
}

async function waitForPanelReady(panelEditPage: PanelEditPage) {
  const panelRoot = panelEditPage.panel.locator;
  await expect(panelRoot).toBeVisible({ timeout: PANEL_READY_TIMEOUT });

  const heatmap = panelRoot.locator(HEATMAP_SELECTOR);
  const emptyState = panelRoot.locator('text="No data available"');

  type VisibilityOutcome = {
    target: 'heatmap' | 'empty state';
    visible: boolean;
    error?: unknown;
  };

  const heatmapWait: Promise<VisibilityOutcome> = heatmap
    .waitFor({ state: 'visible', timeout: PANEL_READY_TIMEOUT })
    .then(
      () => ({ target: 'heatmap', visible: true }),
      (error) => ({ target: 'heatmap', visible: false, error })
    );

  const emptyWait: Promise<VisibilityOutcome> = emptyState
    .waitFor({ state: 'visible', timeout: PANEL_READY_TIMEOUT })
    .then(
      () => ({ target: 'empty state', visible: true }),
      (error) => ({ target: 'empty state', visible: false, error })
    );

  const firstResult = await Promise.race([heatmapWait, emptyWait]);

  if (firstResult.visible) {
    return;
  }

  const otherResult = firstResult.target === 'heatmap' ? await emptyWait : await heatmapWait;

  if (otherResult.visible) {
    return;
  }

  const formatOutcome = (outcome: VisibilityOutcome) => {
    if (outcome.visible) {
      return `${outcome.target} became visible`;
    }

    const detail =
      outcome.error instanceof Error
        ? outcome.error.message
        : outcome.error
          ? String(outcome.error)
          : 'timed out or remained hidden';
    return `${outcome.target} not visible within ${PANEL_READY_TIMEOUT}ms: ${detail}`;
  };

  throw new Error(
    [
      `Panel did not render heatmap (${HEATMAP_SELECTOR}) or empty state ("No data available") within ${PANEL_READY_TIMEOUT}ms.`,
      `Outcomes -> ${formatOutcome(firstResult)}; ${formatOutcome(otherResult)}.`,
    ].join(' ')
  );
}

async function openPanelEditPageById(id: string, deps: PanelDeps, overrides?: PanelOptionsOverrides) {
  const provisionedDashboard = await deps.readProvisionedDashboard({ fileName: DASHBOARD_FILE });

  if (!overrides) {
    const dashboard = deepCloneProvisionedDashboard(provisionedDashboard);
    const panelEditPage = await deps.gotoPanelEditPage({ dashboard, id });
    await waitForPanelReady(panelEditPage);
    return panelEditPage;
  }

  const tempUid = await createTemporaryDashboardWithOverrides({
    panelId: id,
    overrides,
    provisionedDashboard,
    request: deps.request,
  });
  tempDashboardUids.add(tempUid);

  const panelEditPage = await deps.gotoPanelEditPage({
    dashboard: {
      uid: tempUid,
    },
    id,
  });
  await waitForPanelReady(panelEditPage);
  return panelEditPage;
}

test.beforeEach(async ({ page }, testInfo) => {
  tempDashboardUids.clear();

  // Capture browser console errors for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // eslint-disable-next-line no-console
      console.log(`[Browser Error - ${testInfo.title}] ${msg.text()}`);
    }
  });
});

test.afterEach(async ({ request }) => {
  const uidsToDelete = Array.from(tempDashboardUids);
  tempDashboardUids.clear();

  for (const uid of uidsToDelete) {
    const deleteResponse = await request.delete(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
    if (deleteResponse.status() === 404) {
      continue;
    }

    if (!deleteResponse.ok()) {
      const body = await deleteResponse.text();
      throw new Error(
        `Failed to delete temporary dashboard uid ${uid}: ${deleteResponse.status()} ${deleteResponse.statusText()} ${body}`
      );
    }
  }
});

function normalizeColor(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function hexToRgb(hexColor: string): string | null {
  const normalized = hexColor.trim().toLowerCase();
  const match = normalized.match(/^#([0-9a-f]{6})$/i);

  if (!match) {
    return null;
  }

  const hex = match[1];
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

function colorMatchesHex(actualColor: string, expectedHex: string): boolean {
  const actual = normalizeColor(actualColor);
  const expectedHexNormalized = normalizeColor(expectedHex);
  const expectedRgb = hexToRgb(expectedHex);
  const expectedRgbNormalized = expectedRgb ? normalizeColor(expectedRgb) : null;
  const expectedRgbaNormalized = expectedRgbNormalized
    ? expectedRgbNormalized.replace('rgb(', 'rgba(').replace(')', ',1)')
    : null;

  return (
    actual === expectedHexNormalized ||
    (expectedRgbNormalized !== null && actual === expectedRgbNormalized) ||
    (expectedRgbaNormalized !== null && actual === expectedRgbaNormalized)
  );
}

async function getHeatmapCellFills(panelEditPage: PanelEditPage): Promise<HeatmapCellFill[]> {
  const cells = panelEditPage.panel.locator.locator(HEATMAP_CELL_SELECTOR);
  await expect(cells.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

  return cells.evaluateAll((nodes) => {
    return nodes
      .map((node) => {
        const element = node as SVGRectElement;
        const attrFill = element.getAttribute('fill') ?? '';
        const computedFill = window.getComputedStyle(element).fill ?? '';

        return {
          date: element.getAttribute('data-date') ?? '',
          fill: attrFill || computedFill,
        };
      })
      .filter((entry) => Boolean(entry.date));
  });
}

function countChangedCellFills(before: HeatmapCellFill[], after: HeatmapCellFill[]): number {
  const beforeByDate = new Map(before.map((entry) => [entry.date, normalizeColor(entry.fill)]));
  let changedCount = 0;

  for (const entry of after) {
    const previousFill = beforeByDate.get(entry.date);
    if (previousFill && previousFill !== normalizeColor(entry.fill)) {
      changedCount += 1;
    }
  }

  return changedCount;
}

function countCellsTransitionedToColor(before: HeatmapCellFill[], after: HeatmapCellFill[], targetHex: string): number {
  const beforeByDate = new Map(before.map((entry) => [entry.date, entry.fill]));
  let transitionedCount = 0;

  for (const entry of after) {
    const previousFill = beforeByDate.get(entry.date);

    if (!previousFill) {
      continue;
    }

    const isBeforeTarget = colorMatchesHex(previousFill, targetHex);
    const isAfterTarget = colorMatchesHex(entry.fill, targetHex);

    if (!isBeforeTarget && isAfterTarget) {
      transitionedCount += 1;
    }
  }

  return transitionedCount;
}

async function getSvgTextValues(panelEditPage: PanelEditPage, selector: string): Promise<string[]> {
  return panelEditPage.panel.locator.locator(selector).evaluateAll((nodes) => {
    return nodes.map((node) => node.textContent?.trim() ?? '').filter((text) => text.length > 0);
  });
}

async function getFirstWeekLabel(panelEditPage: PanelEditPage): Promise<string> {
  const labels = await getSvgTextValues(panelEditPage, WEEK_LABEL_SELECTOR);
  return labels[0] ?? '';
}

// 1. Panel without data should display the no-data message
test('shows "No data available" when the panel has no data', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_NO_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
    request,
  });

  await expect(panelEditPage.panel.locator.getByText('No data available')).toBeVisible({
    timeout: EXPECT_TIMEOUT,
  });
});

// 2. Panel with data should render the calendar heatmap
test('renders calendar heatmap with data', async ({ gotoPanelEditPage, readProvisionedDashboard, request }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
    request,
  });

  const heatmap = panelEditPage.panel.locator.locator(HEATMAP_SELECTOR);
  await expect(heatmap).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const cells = heatmap.locator(HEATMAP_CELL_SELECTOR);
  await expect(cells.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 3. Legend visibility toggle
test('legend can be toggled on and off', async ({ gotoPanelEditPage, readProvisionedDashboard, request }) => {
  const panelWithLegend = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
    request,
  });

  await expect(panelWithLegend.panel.locator.getByText('Less')).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(panelWithLegend.panel.locator.getByText('More')).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const panelWithoutLegend = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showLegend: false,
    }
  );

  await expect(panelWithoutLegend.panel.locator.getByText('Less')).toBeHidden({ timeout: EXPECT_TIMEOUT });
  await expect(panelWithoutLegend.panel.locator.getByText('More')).toBeHidden({ timeout: EXPECT_TIMEOUT });

  const panelWithLegendAgain = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showLegend: true,
    }
  );

  await expect(panelWithLegendAgain.panel.locator.getByText('Less')).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(panelWithLegendAgain.panel.locator.getByText('More')).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 4. Week labels toggle
test('week labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard, request }) => {
  const panelWithWeekLabels = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
    }
  );

  await expect(panelWithWeekLabels.panel.locator.locator(WEEK_LABEL_SELECTOR).first()).toBeVisible({
    timeout: EXPECT_TIMEOUT,
  });

  const panelWithoutWeekLabels = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: false,
    }
  );

  await expect(panelWithoutWeekLabels.panel.locator.locator(WEEK_LABEL_SELECTOR).first()).toBeHidden({
    timeout: EXPECT_TIMEOUT,
  });

  const panelWithWeekLabelsAgain = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
    }
  );

  await expect(panelWithWeekLabelsAgain.panel.locator.locator(WEEK_LABEL_SELECTOR).first()).toBeVisible({
    timeout: EXPECT_TIMEOUT,
  });
});

// 5. Month labels toggle
test('month labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard, request }) => {
  const panelWithMonthLabels = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showMonthLabels: true,
    }
  );

  const monthLabelsVisible = panelWithMonthLabels.panel.locator.locator(MONTH_LABEL_SELECTOR);
  await expect.poll(async () => monthLabelsVisible.count()).toBeGreaterThan(0);
  await expect(monthLabelsVisible.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const panelWithoutMonthLabels = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showMonthLabels: false,
    }
  );

  const monthLabelsHidden = panelWithoutMonthLabels.panel.locator.locator(MONTH_LABEL_SELECTOR);
  await expect
    .poll(async () => {
      const hiddenCount = await monthLabelsHidden.count();
      if (hiddenCount === 0) {
        return true;
      }

      return !(await monthLabelsHidden.first().isVisible());
    })
    .toBeTruthy();

  const panelWithMonthLabelsAgain = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showMonthLabels: true,
    }
  );

  const monthLabelsVisibleAgain = panelWithMonthLabelsAgain.panel.locator.locator(MONTH_LABEL_SELECTOR);
  await expect.poll(async () => monthLabelsVisibleAgain.count()).toBeGreaterThan(0);
  await expect(monthLabelsVisibleAgain.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 6. Aggregation option supports First and Last
test('aggregation can switch between First and Last and updates rendered cells', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const firstAggregationPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      aggregation: 'first',
    }
  );

  const firstAggregationFills = await getHeatmapCellFills(firstAggregationPage);

  const lastAggregationPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      aggregation: 'last',
    }
  );

  const lastAggregationFills = await getHeatmapCellFills(lastAggregationPage);
  const changedCount = countChangedCellFills(firstAggregationFills, lastAggregationFills);

  expect(
    changedCount,
    `Expected at least one cell fill to change between First and Last aggregation; compared ${firstAggregationFills.length} baseline cells against ${lastAggregationFills.length} updated cells.`
  ).toBeGreaterThan(0);
});

// 7. Empty color can be configured and used for zero value cells
test('empty color is configurable and applied to zero-value cells', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const baselinePage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      aggregation: 'first',
    }
  );

  const fillsBeforeEmptyColor = await getHeatmapCellFills(baselinePage);

  const configuredEmptyColorPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      aggregation: 'first',
      emptyColor: '#ff00ff',
    }
  );

  const fillsAfterEmptyColor = await getHeatmapCellFills(configuredEmptyColorPage);
  const transitionedToTargetCount = countCellsTransitionedToColor(
    fillsBeforeEmptyColor,
    fillsAfterEmptyColor,
    '#ff00ff'
  );

  expect(
    transitionedToTargetCount,
    `Expected at least one cell to transition from a non-empty color to #ff00ff after configuring Empty Color; compared ${fillsBeforeEmptyColor.length} baseline cells against ${fillsAfterEmptyColor.length} updated cells.`
  ).toBeGreaterThan(0);
});

// 8. Custom color theme can be configured and affects rendering
test('custom color theme is configurable and changes heatmap colors', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const greenPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      colorScheme: 'green',
    }
  );

  const greenBaselineFills = await getHeatmapCellFills(greenPage);

  const redCustomPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      colorScheme: 'custom',
      customColor: '#ff0000',
    }
  );

  const redCustomFills = await getHeatmapCellFills(redCustomPage);
  const changedFromGreenToRed = countChangedCellFills(greenBaselineFills, redCustomFills);

  expect(
    changedFromGreenToRed,
    `Expected at least one cell fill to change after switching from Green to Custom (#ff0000); compared ${greenBaselineFills.length} baseline cells against ${redCustomFills.length} updated cells.`
  ).toBeGreaterThan(0);

  const blueCustomPage = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      colorScheme: 'custom',
      customColor: '#0000ff',
    }
  );

  const blueCustomFills = await getHeatmapCellFills(blueCustomPage);
  const changedFromRedToBlue = countChangedCellFills(redCustomFills, blueCustomFills);

  expect(
    changedFromRedToBlue,
    `Expected at least one cell fill to change after updating Custom Color Theme from #ff0000 to #0000ff; compared ${redCustomFills.length} prior custom cells against ${blueCustomFills.length} updated custom cells.`
  ).toBeGreaterThan(0);
});

// 9. Week start day can be switched across Saturday, Sunday, Monday
test('week start day changes first rendered week label for Saturday/Sunday/Monday', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const customWeekLabels = 'SUN_TOKEN,MON_TOKEN,TUE_TOKEN,WED_TOKEN,THU_TOKEN,FRI_TOKEN,SAT_TOKEN';

  const sundayPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
      weekLabelMode: 'custom',
      weekLabelCustom: customWeekLabels,
      weekStart: 'sunday',
    }
  );

  await expect.poll(() => getFirstWeekLabel(sundayPanel)).toBe('SUN_TOKEN');

  const mondayPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
      weekLabelMode: 'custom',
      weekLabelCustom: customWeekLabels,
      weekStart: 'monday',
    }
  );

  await expect.poll(() => getFirstWeekLabel(mondayPanel)).toBe('MON_TOKEN');

  const saturdayPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
      weekLabelMode: 'custom',
      weekLabelCustom: customWeekLabels,
      weekStart: 'saturday',
    }
  );

  await expect.poll(() => getFirstWeekLabel(saturdayPanel)).toBe('SAT_TOKEN');
});

// 10. Weekday labels support number and custom modes
test('weekday labels can be rendered as numbers or custom labels', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const numberLabelsPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
      weekStart: 'sunday',
      weekLabelMode: 'number',
    }
  );

  await expect
    .poll(async () => {
      const labels = await getSvgTextValues(numberLabelsPanel, WEEK_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => /^\d+$/.test(label));
    })
    .toBeTruthy();

  const customLabelsPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showWeekLabels: true,
      weekStart: 'sunday',
      weekLabelMode: 'custom',
      weekLabelCustom: 'WK1,WK2,WK3,WK4,WK5,WK6,WK7',
    }
  );

  await expect.poll(() => getFirstWeekLabel(customLabelsPanel)).toBe('WK1');
});

// 11. Month labels support number and custom modes
test('month labels can be rendered as numbers or custom labels', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  request,
}) => {
  const numberLabelsPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showMonthLabels: true,
      monthLabelMode: 'number',
    }
  );

  await expect
    .poll(async () => {
      const labels = await getSvgTextValues(numberLabelsPanel, MONTH_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => /^\d+$/.test(label));
    })
    .toBeTruthy();

  const customLabelsPanel = await openPanelEditPageById(
    PANEL_WITH_DATA_ID,
    {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    },
    {
      showMonthLabels: true,
      monthLabelMode: 'custom',
      monthLabelCustom: 'M01,M02,M03,M04,M05,M06,M07,M08,M09,M10,M11,M12',
    }
  );

  const allowedCustomLabels = new Set([
    'M01',
    'M02',
    'M03',
    'M04',
    'M05',
    'M06',
    'M07',
    'M08',
    'M09',
    'M10',
    'M11',
    'M12',
  ]);

  await expect
    .poll(async () => {
      const labels = await getSvgTextValues(customLabelsPanel, MONTH_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => allowedCustomLabels.has(label));
    })
    .toBeTruthy();
});
