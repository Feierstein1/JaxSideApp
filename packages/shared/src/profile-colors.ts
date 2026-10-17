/**
 * D69: account colors. Each person has one (picked at random at sign-up, changeable in
 * Account → Profile). It colors their post headers and borders and their profile header.
 * Text on a color is black or white, whichever reads better (tested ≥ 4.5:1 for all).
 */
export const PROFILE_COLORS = [
  { key: 'teal', name: 'Teal', hex: '#136677' },
  { key: 'gold', name: 'Gold', hex: '#D8A328' },
  { key: 'black', name: 'Black', hex: '#000000' },
  { key: 'old_gold', name: 'Old gold', hex: '#9E7A2C' },
  { key: 'red', name: 'Red', hex: '#C62828' },
  { key: 'crimson', name: 'Crimson', hex: '#8E1B3A' },
  { key: 'orange', name: 'Orange', hex: '#EF6C00' },
  { key: 'amber', name: 'Amber', hex: '#FFB300' },
  { key: 'sunshine', name: 'Sunshine', hex: '#FDD835' },
  { key: 'lime', name: 'Lime', hex: '#C0CA33' },
  { key: 'green', name: 'Green', hex: '#2E7D32' },
  { key: 'mint', name: 'Mint', hex: '#66BB6A' },
  { key: 'emerald', name: 'Emerald', hex: '#00897B' },
  { key: 'sky', name: 'Sky', hex: '#29B6F6' },
  { key: 'blue', name: 'Blue', hex: '#1565C0' },
  { key: 'navy', name: 'Navy', hex: '#1A237E' },
  { key: 'indigo', name: 'Indigo', hex: '#3949AB' },
  { key: 'purple', name: 'Purple', hex: '#6A1B9A' },
  { key: 'lavender', name: 'Lavender', hex: '#9575CD' },
  { key: 'pink', name: 'Pink', hex: '#EC407A' },
  { key: 'rose', name: 'Rose', hex: '#F48FB1' },
  { key: 'brown', name: 'Brown', hex: '#6D4C41' },
  { key: 'slate', name: 'Slate', hex: '#546E7A' },
  { key: 'silver', name: 'Silver', hex: '#B0BEC5' },
] as const;

export type ProfileColorKey = (typeof PROFILE_COLORS)[number]['key'];
export const PROFILE_COLOR_KEYS = PROFILE_COLORS.map((c) => c.key) as [
  ProfileColorKey,
  ...ProfileColorKey[],
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Black or white, whichever is easier to read on `hex`. */
export function textOn(hex: string): '#000000' | '#FFFFFF' {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/** The color for a key (unknown or missing keys fall back to teal). */
export function profileColor(key: string | null | undefined) {
  const c = PROFILE_COLORS.find((x) => x.key === key) ?? PROFILE_COLORS[0];
  return { ...c, text: textOn(c.hex) };
}

export function randomProfileColor(): ProfileColorKey {
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)]!.key;
}
