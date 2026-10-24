/**
 * Brand colors (D33): Jacksonville Jaguars team colors plus white.
 * See docs/UI_DESIGN.md for which pairings are allowed. In short, the gold colors are
 * hard to read on white, so never use gold for text on white or white text on gold.
 */
export const BRAND = {
  gold: '#D8A328', // rgb(216, 163, 40)
  teal: '#136677', // rgb(19, 102, 119)
  black: '#000000', // rgb(0, 0, 0)
  oldGold: '#9E7A2C', // rgb(158, 122, 44)
  white: '#FFFFFF', // rgb(255, 255, 255)
} as const;

/**
 * Semantic tokens. Screens use these, not raw BRAND values, so a pairing that
 * fails contrast can't creep in. Ratios are WCAG 2 contrast against the paired color.
 */
export const COLORS = {
  background: BRAND.white,
  text: BRAND.black, // 21:1 on white
  textMuted: '#4A4A4A', // 8.9:1 on white (neutral, for secondary text)

  primary: BRAND.teal, // main buttons, links: 6.6:1 with white
  onPrimary: BRAND.white,

  accent: BRAND.gold, // highlights, badges, active tab: pair with black text (9.2:1)
  onAccent: BRAND.black,
  accentSoft: '#F7ECD3', // light gold tint for banners; black text 17.9:1

  primarySoft: '#E2F0F2', // light teal tint for selected rows; black text 18:1
  scrim: 'rgba(0,0,0,0.45)', // dim layer behind sheets

  accentDark: BRAND.oldGold, // medals, borders, large text/icons only (4.0:1 on white)

  surfaceInverse: BRAND.black, // dark header or hero areas
  onSurfaceInverse: BRAND.white, // gold text is also fine here (9.2:1)

  placeholder: '#6B6B6B', // 5.3:1 on white (input hints)
  border: '#8A8A8A', // 3.4:1 on white (input outlines need 3:1)
  cardBorder: '#E3E3E3', // decorative card edge (not a control, so no contrast minimum)
  shadow: BRAND.black,
  surfaceMuted: '#F4F5F6', // page background behind cards
  /**
   * D70: dark grey behind post and place cards, a step lighter than the black header so
   * the bar and the content are visibly different.
   */
  surfaceDark: '#1E1F22',
  onSurfaceDark: '#FFFFFF', // 16.6:1
  onSurfaceDarkMuted: '#B8BCC2', // secondary text on surfaceDark (9.3:1)
  errorOnDark: '#FF8A80', // error text on surfaceDark (8.0:1)
  /**
   * D78: a raised dark surface for search fields, chips and icon buttons on the black bar
   * and the dark-grey background. White, muted and gold text all pass 4.5:1 on it (tested).
   */
  surfaceDarkRaised: '#2B2D31',
  /** D78: loading placeholders (decorative, no contrast minimum). */
  skeletonOnDark: '#33363B',
  skeletonOnLight: '#E7E8EB',
  /** D78: hairline dividers inside white cards (decorative). */
  hairline: '#EDEEF0',
  // Functional colors outside the brand palette, kept for clarity and accessibility.
  error: '#B00020', // 7.3:1 on white
  errorSoft: '#FDECEE', // D78: light red tint behind form errors; error and black text pass
} as const;

/**
 * D79: the mobile app's dark theme, used on every screen. Layers go from black bars to a
 * dark-grey page to lighter cards and raised controls. D110: actions and highlights are a
 * bright teal (black text on it); gold read too much like adult sites with the black. Medals
 * keep their gold. Brand teal is too dark to read as text on these greys, so the accent and
 * `tealText` are lighter tints of it; selected states keep the deep brand teal.
 * Every text pairing is tested in theme.test.ts. The admin portal keeps `COLORS`.
 */
export const DARK = {
  bar: BRAND.black, // header, tab bar and the control bar under the header
  page: '#1E1F22', // every screen's background
  card: '#2B2D31', // posts, places, grouped lists, sheets
  raised: '#383A40', // inputs, pills, chips and icon buttons
  hairline: '#3F4147', // dividers (decorative)

  text: '#F2F3F5',
  textMuted: '#B5BAC1',
  placeholder: '#A3A9B1',
  border: '#878C94', // input outlines (≥ 3:1 on raised, card and page)

  accent: '#3DB8C9', // D110: main actions, links, active tab, focus (teal; ≥ 4.8:1 on every layer)
  onAccent: BRAND.black, // 8.9:1 on the accent
  accentSoft: '#173A42', // teal-tinted notice background

  teal: BRAND.teal, // selected fills, switches (white text on it)
  onTeal: BRAND.white,
  tealText: '#6CC5D4', // teal for text and icons on dark
  tealSoft: '#173A42', // teal-tinted selected background

  error: '#FF8A80',
  errorSoft: '#3D2224',

  scrim: 'rgba(0,0,0,0.6)',
  shadow: BRAND.black,
} as const;

/**
 * D95: medal artwork colors (mobile). Each medal has its own shape and color: First
 * Contribution a teal coin, Approved Contributor a gold hexagon, Well Received a gold laurel
 * rosette. The deep shades are only for the back ribbon tails. Symbols are white on teal
 * and black on gold (tested in theme.test.ts).
 */
export const MEDAL = {
  teal: BRAND.teal,
  tealDeep: '#0E4F5C',
  tealLine: '#6CC5D4',
  gold: BRAND.gold,
  oldGold: BRAND.oldGold,
  goldDeep: '#7A5E22',
  face: '#2B2D31', // the dark center, same as DARK.card
  onTeal: BRAND.white,
  onGold: BRAND.black,
  glyph: '#F2F3F5', // symbol on the dark center, same as DARK.text
} as const;

/**
 * P15.2 / P15.4: the app icon's colors (apps/mobile/assets/brand/icon-emblem.svg), for the
 * emblem drawn in the app (the animated loading screen) and the navy sign-in header.
 * Navy and blues only; the lit fins and the name use DARK.accent.
 */
export const EMBLEM = {
  navy: '#071A33', // the icon's background and the sign-in header
  panel: '#0B2545', // inside the stepped frame
  ray: '#0F2D55', // sunburst rays
  bridge: '#3C8DDE', // bridge towers, truss and deck
  bridgeLight: '#7CC2FF', // tower caps
  building: '#EEF3FA', // the Modis Building, the frame outline and the base ornament
  buildingShade: '#C6D5E9', // the building's shaded side
  curtain: '#2C5E9E', // the glass front
  fin: '#6FA0D8', // the glass front's vertical fins
  base: '#4F86C6', // the building's base
  baseLine: '#8DB8E8', // lines on the base
  water: '#10305A', // water stripes
  onNavyMuted: '#C6D5E9', // secondary text on navy
} as const;
