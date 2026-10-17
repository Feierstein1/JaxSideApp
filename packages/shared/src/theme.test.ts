import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, categoryColor } from './schemas/directory';
import { BRAND, COLORS } from './theme';

/** WCAG 2 contrast ratio between two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('brand palette (D33)', () => {
  it('matches the Jaguars reference colors plus white', () => {
    expect(BRAND).toEqual({
      gold: '#D8A328',
      teal: '#136677',
      black: '#000000',
      oldGold: '#9E7A2C',
      white: '#FFFFFF',
    });
  });

  // Text pairings used by the app must meet WCAG AA for normal text (4.5:1).
  it.each([
    ['text on background', COLORS.text, COLORS.background],
    ['muted text on background', COLORS.textMuted, COLORS.background],
    ['onPrimary on primary', COLORS.onPrimary, COLORS.primary],
    ['primary (links) on background', COLORS.primary, COLORS.background],
    ['onAccent on accent', COLORS.onAccent, COLORS.accent],
    ['text on accentSoft (banners)', COLORS.text, COLORS.accentSoft],
    ['primary on accentSoft', COLORS.primary, COLORS.accentSoft],
    ['error on background', COLORS.error, COLORS.background],
    ['error on accentSoft', COLORS.error, COLORS.accentSoft],
    ['onSurfaceInverse on surfaceInverse', COLORS.onSurfaceInverse, COLORS.surfaceInverse],
    ['gold on black', BRAND.gold, BRAND.black],
    ['white on surfaceDark', COLORS.onSurfaceDark, COLORS.surfaceDark],
    ['muted on surfaceDark', COLORS.onSurfaceDarkMuted, COLORS.surfaceDark],
    ['error on surfaceDark', COLORS.errorOnDark, COLORS.surfaceDark],
    ['gold on surfaceDark', BRAND.gold, COLORS.surfaceDark],
  ])('%s passes 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  // Documents why these pairings are banned in docs/UI_DESIGN.md.
  it.each([
    ['gold text on white', BRAND.gold, BRAND.white],
    ['white text on gold', BRAND.white, BRAND.gold],
    ['gold text on teal', BRAND.gold, BRAND.teal],
  ])('%s fails 4.5:1 (banned for text)', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeLessThan(4.5);
  });
});

describe('category colors (D70)', () => {
  it.each(Object.entries(CATEGORY_COLORS))('%s takes white text at ≥ 4.5:1', (_k, hex) => {
    expect(contrast('#FFFFFF', hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('9 distinct colors, every category maps to one', () => {
    expect(new Set(Object.values(CATEGORY_COLORS)).size).toBe(9);
    expect(categoryColor('cafe')).toBe(CATEGORY_COLORS.coffee);
    expect(categoryColor('somethingnew')).toBe(CATEGORY_COLORS.other);
  });

  it('the dark background is visibly lighter than the black header', () => {
    expect(contrast(COLORS.surfaceDark, COLORS.surfaceInverse)).toBeGreaterThan(1.15);
  });
});
