import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@jax/shared';
import { findRepoRoot } from '../repo-root';

/**
 * D113: the map's markers are the category icons on a circle in the category color, drawn in
 * the map page with the Ionicons font (the same icons as the app's list). Each group's icon
 * as an Ionicons character code (from the font's glyph map; `map.test.ts` checks them).
 */
export const ICON_GLYPHS: Record<string, number> = {
  restaurant: 62773,
  cafe: 61897,
  beer: 61843,
  leaf: 62386,
  'bag-handle': 61790,
  ticket: 62938,
  car: 61921,
  bed: 61840,
  barbell: 61810,
  heart: 62314,
  school: 62812, // D149: campuses
  location: 62404,
};

/** For the page: each category group's character and color. */
export function markerStyles(): Record<string, { code: number; color: string }> {
  return Object.fromEntries(
    Object.entries(CATEGORY_ICONS).map(([group, icon]) => [
      group,
      { code: ICON_GLYPHS[icon]!, color: CATEGORY_COLORS[group as keyof typeof CATEGORY_COLORS] },
    ]),
  );
}

let font: Buffer | null = null;
export async function iconFont(): Promise<Buffer> {
  font ??= await readFile(path.join(findRepoRoot(), 'apps/server/assets/map/Ionicons.ttf'));
  return font;
}
