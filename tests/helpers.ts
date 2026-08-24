import type { Locator, Page } from '@playwright/test';

/**
 * Selectors that identify the Grafana portal container, which may host
 * transient announcement banners (e.g. the "Grafana Assistant is now
 * available to OSS users" banner that appears on the
 * grafana-enterprise@dev-preview-react19 CI image).
 *
 * Order matters: the most specific/stable selector is tried first.
 */
const PORTAL_CONTAINER_SELECTORS = [
  '#grafana-portal-container',
  // Grafana's e2e-selectors prefix values with 'data-testid ', so the rendered
  // attribute value literally contains it.
  '[data-testid="data-testid portal-container"]',
];

/**
 * A Playwright selector matching elements that signal an announcement banner is
 * present inside the portal container (e.g. the "Grafana Assistant" heading, or
 * an element whose data-testid mentions "announcement" or "banner").
 *
 * Note: `:has-text()` is a Playwright text selector and is therefore resolved
 * via the Locator API (not `querySelector`), so the banner-detection check
 * below uses `portal.locator(...)` rather than `portal.evaluate`.
 */
const ANNOUNCEMENT_MARKER_SELECTOR =
  'h2:has-text("Grafana Assistant"), [data-testid*="announcement"], [data-testid*="banner"]';

/**
 * Candidate close/dismiss controls for announcement banners. Each selector is
 * tried in order within the portal container; the first match is clicked.
 *
 * Grafana banners commonly expose a close button with an `aria-label` of
 * "Close" or "Dismiss", or a dedicated `[data-testid]` close affordance.
 * Standard aria-label affordances are tried first as they are the most stable.
 */
const ANNOUNCEMENT_CLOSE_SELECTORS = [
  'button[aria-label="Close"]',
  '[aria-label="Close"]',
  '[data-testid="announcement-close"]',
  '[data-testid="close"]',
  '[data-testid="close-button"]',
  'button[aria-label="Dismiss"]',
  '[aria-label="Dismiss"]',
  'button.close',
  'button.dismiss',
  '.close-button',
  '.dismiss-button',
];

/**
 * Dismisses any transient Grafana announcement banner that renders inside the
 * Grafana portal container and would otherwise overlay the panel, intercepting
 * pointer events (notably on the grafana-enterprise@dev-preview-react19 CI
 * image where a "Grafana Assistant is now available to OSS users" banner
 * appears).
 *
 * This is a best-effort, non-failing no-op when no banner is present, so it is
 * safe to call before interactions in every test without slowing down matrix
 * jobs that don't show the banner.
 */
export async function dismissAnnouncements(page: Page): Promise<void> {
  try {
    const portal = await findPortalContainer(page);
    if (portal === null) {
      return;
    }

    // Only act if the portal actually hosts an announcement banner.
    const hasBanner = (await portal.locator(ANNOUNCEMENT_MARKER_SELECTOR).count()) > 0;

    if (!hasBanner) {
      return;
    }

    // Try each close/dismiss control in order.
    for (const selector of ANNOUNCEMENT_CLOSE_SELECTORS) {
      const closeButton = portal.locator(selector).first();
      if (await closeButton.count()) {
        try {
          await closeButton.click({ timeout: 1_000 });
          return;
        } catch {
          // Close control exists but is not actionable; try the next candidate.
          continue;
        }
      }
    }

    // Fallback: press Escape scoped to the banner via a focusable element.
    const focusable = portal
      .locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      .first();

    if (await focusable.count()) {
      await focusable.focus({ timeout: 1_000 });
      await focusable.press('Escape', { timeout: 1_000 });
    } else {
      console.warn(
        'dismissAnnouncements: announcement banner present but no close control or focusable element found; continuing.'
      );
    }
  } catch (error) {
    console.warn('dismissAnnouncements: failed to dismiss announcement banner, continuing.', error);
  }
}

/**
 * Retries a hover interaction, dismissing any Grafana announcement banner that
 * may intercept pointer events between attempts.
 *
 * The banner renders asynchronously after app boot; a one-shot hover may run
 * before the banner exists (silent no-op) or after it appears (pointer-events
 * interception). This wrapper retries the hover up to `attempts` times,
 * dismissing announcements on each retry whose failure message indicates
 * pointer-event interception. Any other error is re-thrown immediately, as is
 * the error when all attempts are exhausted.
 */
export async function hoverWithBannerRetry(locator: Locator, attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await locator.hover();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isPointerInterception = message.includes('intercepts pointer events');

      if (!isPointerInterception || attempt === attempts) {
        throw error;
      }

      await dismissAnnouncements(locator.page());
    }
  }
}

/**
 * Finds the Grafana portal container locator, if present.
 */
async function findPortalContainer(page: Page): Promise<Locator | null> {
  for (const selector of PORTAL_CONTAINER_SELECTORS) {
    const locator = page.locator(selector);
    if (await locator.count()) {
      return locator;
    }
  }

  return null;
}
