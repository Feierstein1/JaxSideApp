import data from '../../../data/neighborhoods/duval-neighborhoods.json';
import type { GeoPoint } from './eligibility';

/**
 * D72: the "Near Avondale" label. The name of the closest named neighborhood point to the
 * person's verified location (free OSM + City of Jacksonville points + our own pins; no
 * outlines exist, so this is approximate near borders). Shown only to that person, about
 * their own location; never stored or attached to posts.
 */

/** Farther than this from every named point (rural edges), say nothing rather than guess. */
export const NEIGHBORHOOD_MAX_METERS = 5000;

const POINTS = data.neighborhoods;

export function metersBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export function nearestNeighborhood(at: GeoPoint): string | null {
  const here = { lat: at.latitude, lon: at.longitude };
  let best: { name: string; d: number } | null = null;
  for (const p of POINTS) {
    const d = metersBetween(here, p);
    if (!best || d < best.d) best = { name: p.name, d };
  }
  return best && best.d <= NEIGHBORHOOD_MAX_METERS ? best.name : null;
}
