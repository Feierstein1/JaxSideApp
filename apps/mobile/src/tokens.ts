import type { TextStyle, ViewStyle } from 'react-native';
import { COLORS } from '@jax/shared';

/**
 * D78: one spacing, corner and type scale for every screen, so gaps, corners and text sizes
 * line up across the app. Colors still come only from `COLORS` in `@jax/shared`.
 */
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const TYPE = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3 },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

/** Soft drop shadows: 1 = resting card, 2 = floating button, 3 = toast or sheet. */
export function elevation(level: 1 | 2 | 3): ViewStyle {
  const s = { 1: [0.08, 6, 2, 2], 2: [0.3, 10, 4, 6], 3: [0.35, 16, 6, 10] }[level];
  return {
    shadowColor: COLORS.shadow,
    shadowOpacity: s[0],
    shadowRadius: s[1],
    shadowOffset: { width: 0, height: s[2]! },
    elevation: s[3],
  };
}
