import type { TextStyle, ViewStyle } from 'react-native';
import { DARK } from '@jax/shared';

/**
 * D78 / D79: one spacing, corner and type scale for every screen, so gaps, corners and
 * text sizes line up across the app. Colors come only from `DARK` in `@jax/shared`; the
 * typeface comes from `@/text`.
 */
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * D127 (art deco): corners are nearly square, so shapes read as geometric like the icon's
 * frame; the main pieces (cards, buttons, tabs, posts) get clipped or pointed ends from
 * `@/deco`. `pill` stays round for circles (photos, round buttons). Was sm 8 / md 12 /
 * lg 16 / xl 24 before D127.
 */
export const RADIUS = { sm: 3, md: 4, lg: 4, xl: 6, pill: 999 } as const;

export const TYPE = {
  display: { fontSize: 44, lineHeight: 50, fontWeight: '800', letterSpacing: -1.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

/** Shadows: 1 = resting card, 2 = floating button, 3 = toast or sheet. */
export function elevation(level: 1 | 2 | 3): ViewStyle {
  const s = { 1: [0.25, 6, 2, 2], 2: [0.45, 10, 4, 6], 3: [0.5, 16, 6, 10] }[level];
  return {
    shadowColor: DARK.shadow,
    shadowOpacity: s[0],
    shadowRadius: s[1],
    shadowOffset: { width: 0, height: s[2]! },
    elevation: s[3],
  };
}

/** The usual screen padding. */
export const GUTTER = SPACE.lg;
