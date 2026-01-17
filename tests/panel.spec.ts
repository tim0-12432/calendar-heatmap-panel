import { expect, test, type PanelEditPage } from '@grafana/plugin-e2e';

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
};

async function toggleSwitch(page: any, switchLocator: any) {
  await switchLocator.click({ force: true });
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

async function openPanelEditPageById(id: string, deps: PanelDeps) {
  const dashboard = await deps.readProvisionedDashboard({ fileName: DASHBOARD_FILE });
  const panelEditPage = await deps.gotoPanelEditPage({ dashboard, id });
  await waitForPanelReady(panelEditPage);
  return panelEditPage;
}

// 1. Panel without data should display the no-data message
test('shows "No data available" when the panel has no data', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_NO_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  await expect(panelEditPage.panel.locator.getByText('No data available')).toBeVisible({
    timeout: EXPECT_TIMEOUT,
  });
});

// 2. Panel with data should render the calendar heatmap
test('renders calendar heatmap with data', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const heatmap = panelEditPage.panel.locator.locator(HEATMAP_SELECTOR);
  await expect(heatmap).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const cells = heatmap.locator(HEATMAP_CELL_SELECTOR);
  await expect(cells.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 3. Legend visibility toggle
test('legend can be toggled on and off', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const legendLess = panelEditPage.panel.locator.getByText('Less');
  const legendMore = panelEditPage.panel.locator.getByText('More');
  const legendSwitch = panelEditPage.getCustomOptions('Labels').getSwitch('Show Legend').locator();

  await expect(legendSwitch).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(legendLess).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(legendMore).toBeVisible({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(page, legendSwitch);
  await expect(legendLess).toBeHidden({ timeout: EXPECT_TIMEOUT });
  await expect(legendMore).toBeHidden({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(page, legendSwitch);
  await expect(legendLess).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(legendMore).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 4. Week labels toggle
test('week labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const weekLabels = panelEditPage.panel.locator.locator(WEEK_LABEL_SELECTOR);
  const weekLabelsSwitch = panelEditPage.getCustomOptions('Labels').getSwitch('Show Week Labels').locator();

  await expect(weekLabelsSwitch).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(weekLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(page, weekLabelsSwitch);
  await expect(weekLabels.first()).toBeHidden({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(page, weekLabelsSwitch);
  await expect(weekLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 5. Month labels toggle
test('month labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const monthLabels = panelEditPage.panel.locator.locator(MONTH_LABEL_SELECTOR);
  const monthLabelsSwitch = panelEditPage.getCustomOptions('Labels').getSwitch('Show Month Labels').locator();

  await expect(monthLabelsSwitch).toBeVisible({ timeout: EXPECT_TIMEOUT });

  const monthLabelsCount = await monthLabels.count();

  if (monthLabelsCount > 0) {
    await expect(monthLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

    await toggleSwitch(page, monthLabelsSwitch);
    await expect(monthLabels.first()).toBeHidden({ timeout: EXPECT_TIMEOUT });

    await toggleSwitch(page, monthLabelsSwitch);
    await expect(monthLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
  } else {
    await toggleSwitch(page, monthLabelsSwitch);
    await toggleSwitch(page, monthLabelsSwitch);
  }
});
