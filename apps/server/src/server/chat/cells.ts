import type { GeoPoint } from '../location/eligibility';

/**
 * D218: live chat rooms are fixed map cells of about one mile, not circles around a person, so
 * everyone standing in the same cell shares one room and nobody's position is a room's centre.
 * These sizes are fixed on purpose: changing them would move every cell and orphan every room.
 *
 * Latitude: 1 mile = 1609.344 m / 111,320 m per degree. Longitude uses Jacksonville's latitude
 * (about 30.3°), where a degree is about 96,100 m.
 */
export const CELL_LAT_DEG = 0.01446;
export const CELL_LNG_DEG = 0.01675;

/** You change room only once you are this far inside another cell, so walking along a border doesn't flip you back and forth. */
export const SWITCH_MARGIN_METERS = 150;

const METERS_PER_DEG_LAT = 111_320;

export interface CellBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** "row:col" of the cell holding a point. Negative columns (west of Greenwich) are fine. */
export function cellKeyOf(p: GeoPoint): string {
  return `${Math.floor(p.latitude / CELL_LAT_DEG)}:${Math.floor(p.longitude / CELL_LNG_DEG)}`;
}

export function cellBounds(key: string): CellBounds {
  const [row, col] = key.split(':').map(Number);
  if (row === undefined || col === undefined || !Number.isInteger(row) || !Number.isInteger(col))
    throw new Error(`bad cell key: ${key}`);
  return {
    south: row * CELL_LAT_DEG,
    north: (row + 1) * CELL_LAT_DEG,
    west: col * CELL_LNG_DEG,
    east: (col + 1) * CELL_LNG_DEG,
  };
}

export function cellCenter(key: string): GeoPoint {
  const b = cellBounds(key);
  return { latitude: (b.south + b.north) / 2, longitude: (b.west + b.east) / 2 };
}

/** How far outside the cell the point is, in metres (0 when inside). */
export function metersOutside(key: string, p: GeoPoint): number {
  const b = cellBounds(key);
  const dLat = Math.max(0, b.south - p.latitude, p.latitude - b.north) * METERS_PER_DEG_LAT;
  const dLng =
    Math.max(0, b.west - p.longitude, p.longitude - b.east) *
    METERS_PER_DEG_LAT *
    Math.cos((p.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * The room for a verified point. Someone already in a room (`previous`) stays there until they
 * are more than SWITCH_MARGIN_METERS outside it; the server decides, never the client.
 */
export function chooseCell(previous: string | null | undefined, p: GeoPoint): string {
  const here = cellKeyOf(p);
  if (previous && previous !== here && metersOutside(previous, p) <= SWITCH_MARGIN_METERS) {
    return previous;
  }
  return here;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** "N", "SE", … : which way `point` lies from `origin` (for naming several cells in one ZIP). */
export function compassFrom(
  origin: { latitude: number; longitude: number },
  point: { latitude: number; longitude: number },
): (typeof COMPASS)[number] {
  const dy = point.latitude - origin.latitude;
  const dx = (point.longitude - origin.longitude) * Math.cos((origin.latitude * Math.PI) / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = north, clockwise
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8]!;
}
