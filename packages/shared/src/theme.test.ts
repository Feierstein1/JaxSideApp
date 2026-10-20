import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, categoryColor } from './schemas/directory';
import { BRAND, COLORS, DARK, MEDAL } from './theme';

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
    ['white on surfaceDarkRaised', COLORS.onSurfaceDark, COLORS.surfaceDarkRaised],
    ['muted on surfaceDarkRaised', COLORS.onSurfaceDarkMuted, COLORS.surfaceDarkRaised],
    ['gold on surfaceDarkRaised', BRAND.gold, COLORS.surfaceDarkRaised],
    ['muted text on surfaceMuted', COLORS.textMuted, COLORS.surfaceMuted],
    ['primary on surfaceMuted', COLORS.primary, COLORS.surfaceMuted],
    ['primary on primarySoft', COLORS.primary, COLORS.primarySoft],
    ['error on errorSoft', COLORS.error, COLORS.errorSoft],
    ['text on errorSoft', COLORS.text, COLORS.errorSoft],
    ['white on black (toast)', COLORS.onSurfaceInverse, COLORS.surfaceInverse],
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
    expect(new Set(Object.values(CATEGORY_COLORS)).size).toBe(10);
    expect(categoryColor('cafe')).toBe(CATEGORY_COLORS.coffee);
    expect(categoryColor('somethingnew')).toBe(CATEGORY_COLORS.other);
  });

  it('the dark background is visibly lighter than the black header', () => {
    expect(contrast(COLORS.surfaceDark, COLORS.surfaceInverse)).toBeGreaterThan(1.15);
  });
});

describe('dark theme (D79)', () => {
  const bgs = { page: DARK.page, card: DARK.card, raised: DARK.raised } as const;
  // Text and links must read at 4.5:1 on every layer they can sit on.
  it.each(
    (['text', 'textMuted', 'placeholder', 'accent', 'tealText', 'error'] as const).flatMap((fg) =>
      Object.entries(bgs).map(([bg, hex]) => [`${fg} on ${bg}`, DARK[fg], hex] as const),
    ),
  )('%s passes 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['onAccent on accent', DARK.onAccent, DARK.accent],
    ['onTeal on teal', DARK.onTeal, DARK.teal],
    ['text on accentSoft', DARK.text, DARK.accentSoft],
    ['accent on accentSoft', DARK.accent, DARK.accentSoft],
    ['tealText on tealSoft', DARK.tealText, DARK.tealSoft],
    ['text on tealSoft', DARK.text, DARK.tealSoft],
    ['error on errorSoft', DARK.error, DARK.errorSoft],
    ['text on bar', DARK.text, DARK.bar],
    ['textMuted on bar', DARK.textMuted, DARK.bar],
  ])('%s passes 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('input outlines reach 3:1 on every layer', () => {
    for (const bg of Object.values(bgs))
      expect(contrast(DARK.border, bg)).toBeGreaterThanOrEqual(3);
  });

  it('category colors take white text, so they work as icon tiles on dark cards', () => {
    for (const hex of Object.values(CATEGORY_COLORS)) {
      expect(contrast(BRAND.white, hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('medal artwork (D95)', () => {
  // Medal symbols are graphics: WCAG asks 3:1 against what they sit on.
  it.each([
    ['white symbol on teal badge', MEDAL.onTeal, MEDAL.teal],
    ['black symbol on gold badge', MEDAL.onGold, MEDAL.gold],
    ['light symbol on the dark center', MEDAL.glyph, MEDAL.face],
    ['gold symbol on the dark center', MEDAL.gold, MEDAL.face],
    ['gold rim against the dark card', MEDAL.gold, DARK.card],
  ])('%s passes 3:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('matches the dark theme it sits on', () => {
    expect(MEDAL.face).toBe(DARK.card);
    expect(MEDAL.glyph).toBe(DARK.text);
    expect(MEDAL.tealLine).toBe(DARK.tealText);
  });
});
