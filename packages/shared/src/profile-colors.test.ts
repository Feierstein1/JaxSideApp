import { describe, expect, it } from 'vitest';
import { contrastRatio, PROFILE_COLORS, profileColor, textOn } from './profile-colors';

describe('account colors (D69)', () => {
  it('has at least 20 distinct colors', () => {
    expect(PROFILE_COLORS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PROFILE_COLORS.map((c) => c.key)).size).toBe(PROFILE_COLORS.length);
    expect(new Set(PROFILE_COLORS.map((c) => c.hex)).size).toBe(PROFILE_COLORS.length);
  });

  it.each(PROFILE_COLORS.map((c) => [c.name, c.hex] as const))(
    '%s header text is readable (≥ 4.5:1)',
    (_name, hex) => {
      expect(contrastRatio(hex, textOn(hex))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('dark colors get white text, light colors black', () => {
    expect(textOn('#000000')).toBe('#FFFFFF');
    expect(textOn('#1A237E')).toBe('#FFFFFF');
    expect(textOn('#FDD835')).toBe('#000000');
    expect(profileColor('nope').key).toBe('teal');
  });
});
