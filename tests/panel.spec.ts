import { expect, test, type PanelEditPage } from '@grafana/plugin-e2e';
import type { APIRequestContext, Locator, Page, Playwright } from '@playwright/test';

const DASHBOARD_FILE = 'dashboard.json';
const PANEL_WITH_DATA_ID = '1';
const PANEL_NO_DATA_ID = '2';
const EXPECT_TIMEOUT = 15_000;
const PANEL_READY_TIMEOUT = 30_000;
const HEATMAP_SELECTOR = 'svg.w-heatmap';
const HEATMAP_CELL_SELECTOR = 'rect[data-date]';
const WEEK_LABEL_SELECTOR = `${HEATMAP_SELECTOR} .w-heatmap-week`;
const MONTH_LABEL_SELECTOR = `${HEATMAP_SELECTOR} text[data-size]`;
const DATA_LINK_URL_TEMPLATE = 'https://e2e.example.test/inspect?value=${__rect.value}&date=${__rect.date}';
const DATA_LINK_TITLE = 'E2E cell link';
// The plugin clamps cell size to a minimum, so only ~44 weeks fit the panel
// width; dashboard ranges must stay narrow enough that all relevant cells
// actually render.
const LINK_DASHBOARD_TIME_RANGE = { from: '2024-01-01T00:00:00Z', to: '2024-08-31T23:59:59Z' };
const SPAN_DASHBOARD_TIME_RANGE = { from: '2024-01-01T00:00:00Z', to: '2024-06-30T23:59:59Z' };
const NARROW_DATA_CSV_CONTENT = [
  'time,value',
  '2024-03-01T00:00:00Z,3',
  '2024-03-02T00:00:00Z,7',
  '2024-03-03T00:00:00Z,11',
].join('\n');
// Daily points spanning 2024-02-01 .. 2024-04-30 (~13 weeks) with distinct,
// strictly increasing values so the data span differs clearly from the
// dashboard range above while staying fully renderable.
const DATA_SPAN_CSV_CONTENT = (() => {
  const rows = ['time,value'];
  const startMs = Date.parse('2024-02-01T00:00:00Z');
  const endMs = Date.parse('2024-04-30T00:00:00Z');

  for (let timestamp = startMs, value = 1; timestamp <= endMs; timestamp += 86_400_000, value += 1) {
    rows.push(`${new Date(timestamp).toISOString().replace('.000Z', 'Z')},${value}`);
  }

  return rows.join('\n');
})();
const HEADER_ONLY_CSV_CONTENT = ['time,value'].join('\n');
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const GRAFANA_USERNAME = process.env.GRAFANA_USERNAME ?? 'admin';
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD ?? 'admin';
// Dedicated tag applied to every temporary dashboard so the leak sweep can
// find (and delete) exactly our dashboards without matching on titles.
const TEMP_DASHBOARD_TAG = 'calendar-heatmap-e2e-temp';

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

// Creates an API request context that is authenticated via a Grafana session
// cookie obtained from POST /api/login. Unlike the anonymous-auth fallback used
// previously, this works both with anonymous auth enabled (local dev) and
// disabled (CI), because every call carries real admin credentials' session.
async function createAuthenticatedRequestContext(playwright: Playwright): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({
    baseURL: GRAFANA_URL,
    storageState: { cookies: [], origins: [] },
  });

  const loginResponse = await context.post('/login', {
    data: { user: GRAFANA_USERNAME, password: GRAFANA_PASSWORD },
  });

  if (!loginResponse.ok()) {
    const body = await loginResponse.text();
    await context.dispose();
    throw new Error(
      `Failed to log in to Grafana as ${GRAFANA_USERNAME}: ${loginResponse.status()} ${loginResponse.statusText()} ${body}`
    );
  }

  return context;
}

// The request fixture logs in per use: each test (and beforeAll/afterAll hook)
// gets its own freshly issued session cookie. This keeps the context immune to
// Grafana rotating session tokens mid-run, since no cookie outlives a single
// test's lifetime.
test.use({
  request: async ({ playwright }, use) => {
    const apiContext = await createAuthenticatedRequestContext(playwright);
    await use(apiContext);
    await apiContext.dispose();
  },
});

type DashboardPanel = {
  id?: number | string;
  options?: Record<string, unknown>;
  fieldConfig?: Record<string, unknown>;
  targets?: Array<Record<string, unknown>>;
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
  transform?: (dashboard: ProvisionedDashboard) => void;
}): Promise<string> {
  const { panelId, overrides, provisionedDashboard, request, transform } = args;

  const dashboard = deepCloneProvisionedDashboard(provisionedDashboard);
  applyPanelOptionsOverrides(dashboard, panelId, overrides);
  transform?.(dashboard);

  const baseUid = typeof dashboard.uid === 'string' && dashboard.uid.length > 0 ? dashboard.uid : 'calendar-heatmap';
  const tempUid = createTempDashboardUid(baseUid);
  const baseTitle =
    typeof dashboard.title === 'string' && dashboard.title.length > 0
      ? dashboard.title
      : 'Calendar Heatmap Temporary Dashboard';

  dashboard.uid = tempUid;
  dashboard.title = `${baseTitle} (temp ${tempUid})`;
  const existingTags = Array.isArray(dashboard.tags)
    ? dashboard.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  dashboard.tags = [...new Set([...existingTags, TEMP_DASHBOARD_TAG])];
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

const UI_LANGUAGE = 'en-US';

// Deletes any leftover temporary dashboards. Matching is tag-based (every temp
// dashboard is created with TEMP_DASHBOARD_TAG), so unrelated dashboards can
// never be affected by the sweep.
async function deleteLeakedTemporaryDashboards(request: APIRequestContext) {
  const searchResponse = await request.get(
    `/api/search?type=dash-db&limit=5000&tag=${encodeURIComponent(TEMP_DASHBOARD_TAG)}`
  );

  if (!searchResponse.ok()) {
    const body = await searchResponse.text();
    throw new Error(
      `Failed to search for leaked temporary dashboards: ${searchResponse.status()} ${searchResponse.statusText()} ${body}`
    );
  }

  const results = (await searchResponse.json()) as Array<{ uid?: string }>;

  for (const entry of Array.isArray(results) ? results : []) {
    if (typeof entry.uid !== 'string') {
      continue;
    }

    const deleteResponse = await request.delete(`/api/dashboards/uid/${encodeURIComponent(entry.uid)}`);
    if (deleteResponse.status() === 404) {
      continue;
    }

    if (!deleteResponse.ok()) {
      const body = await deleteResponse.text();
      throw new Error(
        `Failed to delete leaked temporary dashboard uid ${entry.uid}: ${deleteResponse.status()} ${deleteResponse.statusText()} ${body}`
      );
    }
  }
}

// The Grafana user profile language overrides the browser locale. Pin it to
// English so assertions on Grafana/plugin texts stay deterministic regardless
// of how the container or user profile were configured previously.
async function pinGrafanaUserLanguageToEnglish(playwright: Playwright) {
  const context = await createAuthenticatedRequestContext(playwright);

  try {
    const updateResponse = await context.put('/api/user/preferences', { data: { language: UI_LANGUAGE } });

    if (!updateResponse.ok()) {
      const body = await updateResponse.text();
      throw new Error(
        `Failed to pin the Grafana UI language to "${UI_LANGUAGE}": ${updateResponse.status()} ${updateResponse.statusText()} ${body}`
      );
    }
  } finally {
    await context.dispose();
  }
}

test.beforeEach(() => {
  tempDashboardUids.clear();
});

test.beforeAll(async ({ request, playwright }) => {
  await pinGrafanaUserLanguageToEnglish(playwright);
  await deleteLeakedTemporaryDashboards(request);
});

test.afterAll(async ({ request }) => {
  await deleteLeakedTemporaryDashboards(request);
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

function findPanelInDashboard(dashboard: ProvisionedDashboard, panelId: string): DashboardPanel {
  if (!Array.isArray(dashboard.panels)) {
    throw new Error('Provisioned dashboard does not contain a panels array.');
  }

  const panel = dashboard.panels.find((candidate) => String(candidate.id) === panelId);
  if (!panel) {
    throw new Error(`Could not find panel with id "${panelId}" in provisioned dashboard.`);
  }
  return panel;
}

function normalizeCellDate(rawCellDate: string): string | null {
  const match = rawCellDate.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function getDayDifference(fromIsoDate: string, toIsoDate: string): number {
  const fromMs = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const toMs = Date.parse(`${toIsoDate}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

async function getRenderedCellDateBounds(cells: Locator): Promise<{ first: string; last: string }> {
  await expect(cells.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const rawDates = await cells.evaluateAll((nodes) =>
    nodes.map((node) => (node as Element).getAttribute('data-date') ?? '')
  );
  const normalizedDates = rawDates
    .map(normalizeCellDate)
    .filter((date): date is string => date !== null)
    .sort();

  if (normalizedDates.length === 0) {
    throw new Error(`No parsable ${HEATMAP_CELL_SELECTOR} data-date attributes were found on the page.`);
  }

  return { first: normalizedDates[0], last: normalizedDates[normalizedDates.length - 1] };
}

const VIEW_MODE_READY_TIMEOUT = 60_000;
const INTERACTION_TEST_TIMEOUT = 180_000;

async function openViewModeHeatmapCells(args: { uid: string; page: Page }): Promise<Locator> {
  await args.page.goto(`/d/${args.uid}`, { waitUntil: 'domcontentloaded' });
  const heatmap = args.page.locator(HEATMAP_SELECTOR);
  await expect(heatmap).toBeVisible({ timeout: VIEW_MODE_READY_TIMEOUT });
  return heatmap.locator(HEATMAP_CELL_SELECTOR);
}

async function createTempDashboardWithRangeAndScenario(args: {
  useTimeRangeOfData: boolean;
  scenarioId: string;
  provisionedDashboard: unknown;
  request: APIRequestContext;
  csvContent?: string;
}): Promise<string> {
  const { useTimeRangeOfData, scenarioId, provisionedDashboard, request } = args;

  return createTemporaryDashboardWithOverrides({
    panelId: PANEL_WITH_DATA_ID,
    overrides: { useTimeRangeOfData },
    provisionedDashboard,
    request,
    transform: (dashboard) => {
      dashboard.time = { ...SPAN_DASHBOARD_TIME_RANGE };

      const panel = findPanelInDashboard(dashboard, PANEL_WITH_DATA_ID);
      panel.targets = [
        {
          datasource: {
            type: 'grafana-testdata-datasource',
            uid: 'trlxrdZVk',
          },
          refId: 'A',
          scenarioId,
          csvContent: args.csvContent ?? DATA_SPAN_CSV_CONTENT,
        },
      ];
    },
  });
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

// 12. Tooltips show formatted date and value on hover and can be disabled
test(
  'hovering a heatmap cell shows a tooltip with formatted date and value which can be disabled',
  { timeout: INTERACTION_TEST_TIMEOUT },
  async ({ gotoPanelEditPage, readProvisionedDashboard, request }) => {
    const tooltipEnabledPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
      gotoPanelEditPage,
      readProvisionedDashboard,
      request,
    });

    const enabledCells = tooltipEnabledPage.panel.locator.locator(HEATMAP_CELL_SELECTOR);
    const enabledCellCount = await enabledCells.count();
    expect(enabledCellCount, 'Expected at least one rendered heatmap cell for the tooltip assertions.').toBeGreaterThan(
      0
    );
    const enabledTargetCell = enabledCells.nth(Math.floor(enabledCellCount / 2));
    await expect(enabledTargetCell).toBeAttached({ timeout: EXPECT_TIMEOUT });

    const enabledCellDate = normalizeCellDate((await enabledTargetCell.getAttribute('data-date')) ?? '');
    expect(
      enabledCellDate,
      `Expected the hovered heatmap cell to have a parsable data-date attribute for the tooltip assertion.`
    ).not.toBeNull();

    const [enabledYear, enabledMonth, enabledDay] = (enabledCellDate as string).split('-');
    const tooltipTextPattern = new RegExp(`^${enabledYear}\\/${enabledMonth}\\/${enabledDay}: \\S+`);
    const tooltipLocator = tooltipEnabledPage.ctx.page.getByText(tooltipTextPattern);

    await enabledTargetCell.hover();

    await expect(tooltipLocator.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
    const tooltipText = await tooltipLocator.first().textContent();
    expect(tooltipText, 'Expected the tooltip to contain a formatted date followed by a value.').toMatch(
      tooltipTextPattern
    );

    await tooltipEnabledPage.ctx.page.mouse.move(0, 0);
    await expect.poll(async () => tooltipLocator.count(), { timeout: EXPECT_TIMEOUT }).toBe(0);

    const tooltipDisabledPage = await openPanelEditPageById(
      PANEL_WITH_DATA_ID,
      {
        gotoPanelEditPage,
        readProvisionedDashboard,
        request,
      },
      {
        showTooltip: false,
      }
    );

    const disabledCells = tooltipDisabledPage.panel.locator.locator(HEATMAP_CELL_SELECTOR);
    const disabledCellCount = await disabledCells.count();
    expect(
      disabledCellCount,
      'Expected at least one rendered heatmap cell for the tooltip assertions.'
    ).toBeGreaterThan(0);
    const disabledTargetCell = disabledCells.nth(Math.floor(disabledCellCount / 2));
    await expect(disabledTargetCell).toBeAttached({ timeout: EXPECT_TIMEOUT });

    const disabledCellDate = normalizeCellDate((await disabledTargetCell.getAttribute('data-date')) ?? '');
    expect(
      disabledCellDate,
      `Expected the hovered heatmap cell to have a parsable data-date attribute for the tooltip assertion.`
    ).not.toBeNull();

    const [disabledYear, disabledMonth, disabledDay] = (disabledCellDate as string).split('-');
    const disabledTooltipLocator = tooltipDisabledPage.ctx.page.getByText(
      new RegExp(`^${disabledYear}\\/${disabledMonth}\\/${disabledDay}: \\S+`)
    );

    await disabledTargetCell.hover();
    // Bounded wait to give any lingering tooltip time to dismiss before the
    // negative assertion below; there is no deterministic "tooltip gone" signal.
    await tooltipDisabledPage.ctx.page.waitForTimeout(1_500);

    expect(
      await disabledTooltipLocator.count(),
      'Expected no tooltip matching the hovered cell date while Show Tooltip is disabled.'
    ).toBe(0);
  }
);

// 13. Data links configured with __rect variables open an interpolated context menu
test(
  'clicking a heatmap cell opens the data links context menu with the interpolated url',
  { timeout: INTERACTION_TEST_TIMEOUT },
  async ({ readProvisionedDashboard, request, page }) => {
    const provisionedDashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });

    // Dedicated temporary dashboard with known dates/values so the target cell
    // and the interpolated link URL stay deterministic even if the provisioned
    // fixture changes. weekStart is pinned to 'sunday' (no render shift), so the
    // rendered data-date equals the originalDate that production interpolates.
    const tempUid = await createTemporaryDashboardWithOverrides({
      panelId: PANEL_WITH_DATA_ID,
      overrides: { enableDataLinks: true, weekStart: 'sunday' },
      provisionedDashboard,
      request,
      transform: (dashboard) => {
        dashboard.time = { ...LINK_DASHBOARD_TIME_RANGE };

        const panel = findPanelInDashboard(dashboard, PANEL_WITH_DATA_ID);
        panel.targets = [
          {
            datasource: {
              type: 'grafana-testdata-datasource',
              uid: 'trlxrdZVk',
            },
            refId: 'A',
            scenarioId: 'csv_content',
            csvContent: NARROW_DATA_CSV_CONTENT,
          },
        ];

        const fieldConfig = isRecord(panel.fieldConfig) ? panel.fieldConfig : {};
        panel.fieldConfig = fieldConfig;
        const defaults = isRecord(fieldConfig.defaults) ? fieldConfig.defaults : {};
        fieldConfig.defaults = defaults;
        defaults.links = [
          {
            title: DATA_LINK_TITLE,
            url: DATA_LINK_URL_TEMPLATE,
            targetBlank: true,
          },
        ];
      },
    });
    tempDashboardUids.add(tempUid);

    const cells = await openViewModeHeatmapCells({ uid: tempUid, page });

    // 2024-03-02 is the only row with value 7 in NARROW_DATA_CSV_CONTENT, and
    // the link interpolates the raw (2-decimal-rounded) count, i.e. exactly 7.
    const linkTargetDate = '2024-03-02';
    const linkTargetValue = 7;

    await expect(cells.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

    const rawCellDates = await cells.evaluateAll((nodes) =>
      nodes.map((node) => (node as Element).getAttribute('data-date') ?? '')
    );
    const targetIndex = rawCellDates.findIndex((rawDate) => normalizeCellDate(rawDate) === linkTargetDate);
    expect(targetIndex, `Expected a rendered heatmap cell for ${linkTargetDate}.`).toBeGreaterThanOrEqual(0);

    await cells.nth(targetIndex).dispatchEvent('click');

    const expectedHref = `https://e2e.example.test/inspect?value=${linkTargetValue}&date=${linkTargetDate}`;

    await expect
      .poll(
        async () => {
          const hrefs = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]')).map((anchor) =>
              anchor instanceof HTMLAnchorElement ? anchor.href : (anchor.getAttribute('href') ?? '')
            )
          );
          return hrefs.includes(expectedHref);
        },
        { timeout: EXPECT_TIMEOUT }
      )
      .toBe(true);
  }
);

// 14. useTimeRangeOfData renders the data span and falls back to the dashboard range without data
test(
  'useTimeRangeOfData renders the data time span instead of the dashboard time range',
  { timeout: INTERACTION_TEST_TIMEOUT },
  async ({ readProvisionedDashboard, request, page }) => {
    const provisionedDashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });

    const dashboardRangeUid = await createTempDashboardWithRangeAndScenario({
      useTimeRangeOfData: false,
      scenarioId: 'csv_content',
      provisionedDashboard,
      request,
    });
    tempDashboardUids.add(dashboardRangeUid);

    const dataRangeUid = await createTempDashboardWithRangeAndScenario({
      useTimeRangeOfData: true,
      scenarioId: 'csv_content',
      provisionedDashboard,
      request,
    });
    tempDashboardUids.add(dataRangeUid);

    // Fallback leg: a frame with a time field but zero rows (header-only CSV).
    // The min/max scan finds no valid timestamps (Infinity) and the panel must
    // fall back to the dashboard time range instead of rendering "No data".
    const fallbackUid = await createTempDashboardWithRangeAndScenario({
      useTimeRangeOfData: true,
      scenarioId: 'csv_content',
      csvContent: HEADER_ONLY_CSV_CONTENT,
      provisionedDashboard,
      request,
    });
    tempDashboardUids.add(fallbackUid);

    const dashboardRangeBounds = await getRenderedCellDateBounds(
      await openViewModeHeatmapCells({ uid: dashboardRangeUid, page })
    );
    const dataRangeBounds = await getRenderedCellDateBounds(
      await openViewModeHeatmapCells({ uid: dataRangeUid, page })
    );

    // Disabled leg: the rendered span follows the dashboard range
    // (2024-01-01 .. 2024-06-30), with tolerance for week snapping.
    expect(
      Math.abs(getDayDifference(dashboardRangeBounds.first, '2024-01-01')),
      `Expected the first rendered cell (${dashboardRangeBounds.first}) to be within a few days of the dashboard range start (2024-01-01).`
    ).toBeLessThanOrEqual(6);

    expect(
      Math.abs(getDayDifference('2024-06-30', dashboardRangeBounds.last)),
      `Expected the last rendered cell (${dashboardRangeBounds.last}) to be within a few days of the dashboard range end (2024-06-30).`
    ).toBeLessThanOrEqual(6);

    // Enabled leg: the rendered span follows the data span
    // (2024-02-01 .. 2024-04-30), with tolerance for week snapping.
    expect(
      getDayDifference(dashboardRangeBounds.first, dataRangeBounds.first),
      `Expected the first rendered cell to move from the dashboard start (${dashboardRangeBounds.first}) close to the data start when Use Time Range of Data is enabled; data starts at 2024-02-01.`
    ).toBeGreaterThan(14);

    expect(
      Math.abs(getDayDifference(dataRangeBounds.first, '2024-02-01')),
      `Expected the first rendered cell (${dataRangeBounds.first}) to be within a few days of the first data point (2024-02-01).`
    ).toBeLessThanOrEqual(6);

    expect(
      Math.abs(getDayDifference('2024-04-30', dataRangeBounds.last)),
      `Expected the last rendered cell (${dataRangeBounds.last}) to be within a few days of the last data point (2024-04-30).`
    ).toBeLessThanOrEqual(6);

    const fallbackBounds = await getRenderedCellDateBounds(await openViewModeHeatmapCells({ uid: fallbackUid, page }));
    expect(
      fallbackBounds.first,
      'Expected the fallback (no usable data time range) to render the same first cell as the dashboard time range.'
    ).toBe(dashboardRangeBounds.first);
    expect(
      fallbackBounds.last,
      'Expected the fallback (no usable data time range) to render the same last cell as the dashboard time range.'
    ).toBe(dashboardRangeBounds.last);
  }
);
