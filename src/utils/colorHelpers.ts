import { GrafanaTheme2, colorManipulator } from '@grafana/data';

function parseColorToRgb(theme: GrafanaTheme2, input: string): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const knownColor = theme.visualization.getColorByName(trimmed);
  return colorManipulator.asRgbString(knownColor || trimmed);
}

function buildCustomLevels(base: string, theme: GrafanaTheme2): string[] {
  // 4 levels to match existing legend stability:
  // super-light, light, semi-dark, dark
  const levels = [
    colorManipulator.lighten(base, 0.5),
    colorManipulator.lighten(base, 0.25),
    colorManipulator.darken(base, 0.25),
    colorManipulator.darken(base, 0.5),
  ];

  // Keep behavior aligned with existing logic:
  // reverse in dark mode for perceived contrast
  return theme.isDark ? [...levels].reverse() : levels;
}

// Linearly interpolate between two already-parsed rgb() strings at t in [0, 1].
// t=0 returns `from`, t=1 returns `to`. Preserves alpha if either color has it.
function interpolateRgb(from: string, to: string, t: number): string {
  const a = colorManipulator.decomposeColor(from).values as number[];
  const b = colorManipulator.decomposeColor(to).values as number[];

  const rgb = [0, 1, 2].map((i) => Math.min(255, Math.max(0, Math.round(a[i] + (b[i] - a[i]) * t))));

  return colorManipulator.recomposeColor({ type: 'rgb', values: rgb });
}

// build 'levelCount' shade levels by interpolating directly between an explicit
// low color and an explicit high color. This is intentionally NOT reversed
// for dark theme: the caller defined what "low" and "high" mean explicitly,
// so that ordering is honored as-is regardless of theme.
function buildGradient(lowRgb: string, highRgb: string, levelCount = 4): string[] {

  if (levelCount < 1) {
    return [];
  }

  if (lowRgb === highRgb || levelCount === 1) {
    return Array(Math.max(1, levelCount)).fill(highRgb);
  }

  return Array.from({ length: levelCount }, (_, i) => interpolateRgb(lowRgb, highRgb, i / (levelCount - 1)));
}

export function getColorPalette(
  scheme: string,
  theme: GrafanaTheme2,
  maxCount: number,
  emptyColor?: string,
  customColor?: string,
  gradientMinColor?: string,
  gradientMaxColor?: string
): Record<number, string> {
  const defaultEmptyColor = parseColorToRgb(theme, emptyColor ?? '') || theme.colors.background.canvas;
  const supportedSchemes = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);
  const hue = supportedSchemes.has(scheme) ? scheme : 'custom';

  // @uiw/react-heat-map chooses the first threshold strictly greater than `count`.
  // That means a `count` of 0 would otherwise take the first non-zero bucket color.
  // Adding a `1: emptyColor` threshold makes 0 render as empty.
  const emptyUpperBound = 1;

  // Always expose 4 non-empty shades, regardless of maxCount, to keep the legend stable.
  // We generate strictly increasing *exclusive upper bounds* for the 4 shade buckets.
  const safeMax = Number.isFinite(maxCount) ? Math.max(0, Math.ceil(maxCount)) : 0;
  const shadeQuantiles = [0.25, 0.5, 0.75, 1];

  // Choose 4 colors (either built-in or derived from customColor)
  let colorLevels: string[] | null = null;
  if (scheme === 'custom') {
    const rgb = parseColorToRgb(theme, customColor ?? '');
    if (rgb) {
      colorLevels = buildCustomLevels(rgb, theme);
    }
  } else if (scheme === 'custom-gradient') {
    const lowRgb = parseColorToRgb(theme, gradientMinColor ?? '');
    const highRgb = parseColorToRgb(theme, gradientMaxColor ?? '');
    if (lowRgb && highRgb) {
      colorLevels = buildGradient(lowRgb, highRgb, safeMax);
    }
  }

  // Fallback to built-in palette if custom parsing fails or if a built-in scheme is selected
  if (!colorLevels) {
    const nextHue = hue === 'custom' ? 'green' : hue;

    let shades = ['super-light', 'light', 'semi-dark', 'dark'];
    if (theme.isDark) {
      shades = Array.from(shades).reverse();
    }

    colorLevels = shades.map((shade) => theme.visualization.getColorByName(`${shade}-${nextHue}`));
  }

  const palette: Record<number, string> = {
    0: defaultEmptyColor,
    [emptyUpperBound]: defaultEmptyColor,
  };

  let prev = emptyUpperBound;
  for (let i = 0; i < shadeQuantiles.length; i++) {
    // desired is (inclusive cutoff) + 1 to make it an exclusive upper bound
    const desired = Math.round(safeMax * shadeQuantiles[i]) + 1;
    const bound = Math.max(prev + 1, Math.max(2, desired));
    palette[bound] = colorLevels[i];
    prev = bound;
  }

  return palette;
}
