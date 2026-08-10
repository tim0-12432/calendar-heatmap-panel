import { colorManipulator, GrafanaTheme2 } from '@grafana/data';
import { getColorPalette } from '../colorHelpers';

type ThemeOptions = {
  isDark?: boolean;
  colorMap?: Record<string, string>;
  canvas?: string;
};

function createTheme(options: ThemeOptions = {}): GrafanaTheme2 {
  const { isDark = false, colorMap = {}, canvas = 'rgb(9, 9, 9)' } = options;

  return {
    isDark,
    colors: {
      background: {
        canvas,
      },
    },
    visualization: {
      getColorByName: (name: string) => colorMap[name] ?? '',
    },
  } as unknown as GrafanaTheme2;
}

describe('getColorPalette', () => {
  it('returns built-in scheme palette with stable thresholds and empty color buckets', () => {
    const theme = createTheme({
      colorMap: {
        'super-light-blue': '#dbeafe',
        'light-blue': '#93c5fd',
        'semi-dark-blue': '#3b82f6',
        'dark-blue': '#1d4ed8',
      },
    });

    const palette = getColorPalette('blue', theme, 8, '#f3f4f6');

    expect(
      Object.keys(palette)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([0, 1, 3, 5, 7, 9]);
    expect(palette[0]).toBe(colorManipulator.asRgbString('#f3f4f6'));
    expect(palette[1]).toBe(colorManipulator.asRgbString('#f3f4f6'));
    expect(palette[3]).toBe('#dbeafe');
    expect(palette[5]).toBe('#93c5fd');
    expect(palette[7]).toBe('#3b82f6');
    expect(palette[9]).toBe('#1d4ed8');
  });

  it('builds custom color levels from a resolvable custom color name', () => {
    const theme = createTheme({
      colorMap: {
        'brand-primary': '#336699',
      },
    });

    const palette = getColorPalette('custom', theme, 4, '#000000', 'brand-primary');
    const base = colorManipulator.asRgbString('#336699');
    const expectedLevels = [
      colorManipulator.lighten(base, 0.5),
      colorManipulator.lighten(base, 0.25),
      colorManipulator.darken(base, 0.25),
      colorManipulator.darken(base, 0.5),
    ];

    expect(
      Object.keys(palette)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect([palette[2], palette[3], palette[4], palette[5]]).toEqual(expectedLevels);
  });

  it('falls back to built-in green shades when custom color is invalid', () => {
    const theme = createTheme({
      colorMap: {
        'super-light-green': '#dcfce7',
        'light-green': '#86efac',
        'semi-dark-green': '#22c55e',
        'dark-green': '#166534',
      },
    });

    const palette = getColorPalette('custom', theme, 2, '#000', '   ');

    expect([palette[2], palette[3], palette[4], palette[5]]).toEqual(['#dcfce7', '#86efac', '#22c55e', '#166534']);
  });

  it('reverses non-empty custom levels in dark mode', () => {
    const lightTheme = createTheme({ isDark: false });
    const darkTheme = createTheme({ isDark: true });

    const lightPalette = getColorPalette('custom', lightTheme, 4, '#000000', '#336699');
    const darkPalette = getColorPalette('custom', darkTheme, 4, '#000000', '#336699');

    const lightLevels = [lightPalette[2], lightPalette[3], lightPalette[4], lightPalette[5]];
    const darkLevels = [darkPalette[2], darkPalette[3], darkPalette[4], darkPalette[5]];

    expect(darkLevels).toEqual([...lightLevels].reverse());
  });

  it('keeps stable non-empty thresholds when maxCount is zero', () => {
    const theme = createTheme({
      colorMap: {
        'super-light-red': '#fee2e2',
        'light-red': '#fca5a5',
        'semi-dark-red': '#ef4444',
        'dark-red': '#991b1b',
      },
      canvas: 'rgb(20, 20, 20)',
    });

    const palette = getColorPalette('red', theme, 0);

    expect(
      Object.keys(palette)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(palette[0]).toBe('rgb(20, 20, 20)');
    expect(palette[1]).toBe('rgb(20, 20, 20)');
  });

  it('tests gradient generation', () => {
    const theme = createTheme({ isDark: true });

    const maxCount = 4;
    const redBlueGradient = getColorPalette('custom-gradient', theme, maxCount, '#000', undefined, '#0000ff', '#ff0000');
    const expected = [ "rgb(0, 0, 255)", "rgb(85, 0, 170)", "rgb(170, 0, 85)", "rgb(255, 0, 0)", ]

    expect(Object.keys(redBlueGradient).length).toEqual(6);
    expect([redBlueGradient[2], redBlueGradient[3], redBlueGradient[4], redBlueGradient[5]]).toEqual(expected);
  });

});
