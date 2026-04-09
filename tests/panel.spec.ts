import { expect, test, type PanelEditPage } from '@grafana/plugin-e2e';
import type { Locator } from '@playwright/test';

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

type HeatmapCellFill = {
  date: string;
  fill: string;
};

async function toggleSwitch(switchLocator: Locator) {
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
test('legend can be toggled on and off', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
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

  await toggleSwitch(legendSwitch);
  await expect(legendLess).toBeHidden({ timeout: EXPECT_TIMEOUT });
  await expect(legendMore).toBeHidden({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(legendSwitch);
  await expect(legendLess).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(legendMore).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 4. Week labels toggle
test('week labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const weekLabels = panelEditPage.panel.locator.locator(WEEK_LABEL_SELECTOR);
  const weekLabelsSwitch = panelEditPage.getCustomOptions('Labels').getSwitch('Show Week Labels').locator();

  await expect(weekLabelsSwitch).toBeVisible({ timeout: EXPECT_TIMEOUT });
  await expect(weekLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(weekLabelsSwitch);
  await expect(weekLabels.first()).toBeHidden({ timeout: EXPECT_TIMEOUT });

  await toggleSwitch(weekLabelsSwitch);
  await expect(weekLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
});

// 5. Month labels toggle
test('month labels can be hidden and shown again', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
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

    await toggleSwitch(monthLabelsSwitch);
    await expect(monthLabels.first()).toBeHidden({ timeout: EXPECT_TIMEOUT });

    await toggleSwitch(monthLabelsSwitch);
    await expect(monthLabels.first()).toBeVisible({ timeout: EXPECT_TIMEOUT });
  } else {
    await toggleSwitch(monthLabelsSwitch);
    await toggleSwitch(monthLabelsSwitch);
  }
});

// 6. Aggregation option supports First and Last
test('aggregation can switch between First and Last and updates rendered cells', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const dataOptions = panelEditPage.getCustomOptions('Data');
  const aggregationSelect = dataOptions.getSelect('Aggregation');

  await aggregationSelect.selectOption('First');
  await expect(aggregationSelect).toHaveSelected('First');

  const firstAggregationFills = await getHeatmapCellFills(panelEditPage);

  await aggregationSelect.selectOption('Last');
  await expect(aggregationSelect).toHaveSelected('Last');

  await expect
    .poll(async () => {
      const lastAggregationFills = await getHeatmapCellFills(panelEditPage);
      return countChangedCellFills(firstAggregationFills, lastAggregationFills);
    })
    .toBeGreaterThan(0);

  const lastAggregationFills = await getHeatmapCellFills(panelEditPage);
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
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const dataOptions = panelEditPage.getCustomOptions('Data');
  const aggregationSelect = dataOptions.getSelect('Aggregation');
  await aggregationSelect.selectOption('First');
  await expect(aggregationSelect).toHaveSelected('First');

  const fillsBeforeEmptyColor = await getHeatmapCellFills(panelEditPage);

  const colorOptions = panelEditPage.getCustomOptions('Colors');
  const emptyColorPicker = colorOptions.getColorPicker('Empty Color');

  await emptyColorPicker.selectOption('#ff00ff');

  await expect
    .poll(async () => {
      const fills = await getHeatmapCellFills(panelEditPage);
      return fills.some((entry) => colorMatchesHex(entry.fill, '#ff00ff'));
    })
    .toBeTruthy();

  const fillsAfterEmptyColor = await getHeatmapCellFills(panelEditPage);
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
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const colorOptions = panelEditPage.getCustomOptions('Colors');
  const colorSchemeSelect = colorOptions.getSelect('Color Scheme');

  await colorSchemeSelect.selectOption('Green');
  await expect(colorSchemeSelect).toHaveSelected('Green');

  const greenBaselineFills = await getHeatmapCellFills(panelEditPage);

  await colorSchemeSelect.selectOption('Custom');
  await expect(colorSchemeSelect).toHaveSelected('Custom');

  const customColorPicker = colorOptions.getColorPicker('Custom Color Theme');
  await customColorPicker.selectOption('#ff0000');

  await expect
    .poll(async () => {
      const redCustomFills = await getHeatmapCellFills(panelEditPage);
      return countChangedCellFills(greenBaselineFills, redCustomFills);
    })
    .toBeGreaterThan(0);

  const redCustomFills = await getHeatmapCellFills(panelEditPage);
  const changedFromGreenToRed = countChangedCellFills(greenBaselineFills, redCustomFills);

  expect(
    changedFromGreenToRed,
    `Expected at least one cell fill to change after switching from Green to Custom (#ff0000); compared ${greenBaselineFills.length} baseline cells against ${redCustomFills.length} updated cells.`
  ).toBeGreaterThan(0);

  await customColorPicker.selectOption('#0000ff');

  await expect
    .poll(async () => {
      const blueCustomFills = await getHeatmapCellFills(panelEditPage);
      return countChangedCellFills(redCustomFills, blueCustomFills);
    })
    .toBeGreaterThan(0);

  const blueCustomFills = await getHeatmapCellFills(panelEditPage);
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
  page,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const labelsOptions = panelEditPage.getCustomOptions('Labels');
  const showWeekLabelsSwitch = labelsOptions.getSwitch('Show Week Labels');
  const weekLabelModeRadio = labelsOptions.getRadioGroup('Week Label Mode');
  const weekStartDayRadio = labelsOptions.getRadioGroup('Week Start Day');

  await showWeekLabelsSwitch.check();
  await expect(showWeekLabelsSwitch).toBeChecked();

  await weekLabelModeRadio.check('Custom');
  await expect(weekLabelModeRadio).toHaveChecked('Custom');

  const weekLabelInput = labelsOptions.getTextInput('Custom Week Labels');
  await weekLabelInput.fill('SUN_TOKEN,MON_TOKEN,TUE_TOKEN,WED_TOKEN,THU_TOKEN,FRI_TOKEN,SAT_TOKEN');
  await page.keyboard.press('Tab');

  await weekStartDayRadio.check('Sunday');
  await expect(weekStartDayRadio).toHaveChecked('Sunday');
  await expect.poll(() => getFirstWeekLabel(panelEditPage)).toBe('SUN_TOKEN');

  await weekStartDayRadio.check('Monday');
  await expect(weekStartDayRadio).toHaveChecked('Monday');
  await expect.poll(() => getFirstWeekLabel(panelEditPage)).toBe('MON_TOKEN');

  await weekStartDayRadio.check('Saturday');
  await expect(weekStartDayRadio).toHaveChecked('Saturday');
  await expect.poll(() => getFirstWeekLabel(panelEditPage)).toBe('SAT_TOKEN');
});

// 10. Weekday labels support number and custom modes
test('weekday labels can be rendered as numbers or custom labels', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const labelsOptions = panelEditPage.getCustomOptions('Labels');
  const showWeekLabelsSwitch = labelsOptions.getSwitch('Show Week Labels');
  const weekLabelModeRadio = labelsOptions.getRadioGroup('Week Label Mode');
  const weekStartDayRadio = labelsOptions.getRadioGroup('Week Start Day');

  await showWeekLabelsSwitch.check();
  await expect(showWeekLabelsSwitch).toBeChecked();

  await weekStartDayRadio.check('Sunday');
  await expect(weekStartDayRadio).toHaveChecked('Sunday');

  await weekLabelModeRadio.check('Number');
  await expect(weekLabelModeRadio).toHaveChecked('Number');

  await expect
    .poll(async () => {
      const labels = await getSvgTextValues(panelEditPage, WEEK_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => /^\d+$/.test(label));
    })
    .toBeTruthy();

  await weekLabelModeRadio.check('Custom');
  await expect(weekLabelModeRadio).toHaveChecked('Custom');

  const weekLabelInput = labelsOptions.getTextInput('Custom Week Labels');
  await weekLabelInput.fill('WK1,WK2,WK3,WK4,WK5,WK6,WK7');
  await page.keyboard.press('Tab');

  await expect.poll(() => getFirstWeekLabel(panelEditPage)).toBe('WK1');
});

// 11. Month labels support number and custom modes
test('month labels can be rendered as numbers or custom labels', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const panelEditPage = await openPanelEditPageById(PANEL_WITH_DATA_ID, {
    gotoPanelEditPage,
    readProvisionedDashboard,
  });

  const labelsOptions = panelEditPage.getCustomOptions('Labels');
  const showMonthLabelsSwitch = labelsOptions.getSwitch('Show Month Labels');
  const monthLabelModeRadio = labelsOptions.getRadioGroup('Month Label Mode');

  await showMonthLabelsSwitch.check();
  await expect(showMonthLabelsSwitch).toBeChecked();

  await monthLabelModeRadio.check('Number');
  await expect(monthLabelModeRadio).toHaveChecked('Number');

  await expect
    .poll(async () => {
      const labels = await getSvgTextValues(panelEditPage, MONTH_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => /^\d+$/.test(label));
    })
    .toBeTruthy();

  await monthLabelModeRadio.check('Custom');
  await expect(monthLabelModeRadio).toHaveChecked('Custom');

  const monthLabelInput = labelsOptions.getTextInput('Custom Month Labels');
  await monthLabelInput.fill('M01,M02,M03,M04,M05,M06,M07,M08,M09,M10,M11,M12');
  await page.keyboard.press('Tab');

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
      const labels = await getSvgTextValues(panelEditPage, MONTH_LABEL_SELECTOR);
      return labels.length > 0 && labels.every((label) => allowedCustomLabels.has(label));
    })
    .toBeTruthy();
});
