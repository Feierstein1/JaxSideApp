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
  // Functional colors outside the brand palette, kept for clarity and accessibility.
  error: '#B00020', // 7.3:1 on white
} as const;
