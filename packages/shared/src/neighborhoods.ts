import { NEIGHBORHOOD_POINTS } from './neighborhood-points';

/**
 * D72 / D247: the "Near Avondale" label, and an event's neighborhood. The name of the closest
 * named neighborhood point (free OSM + City of Jacksonville points + our own pins; no outlines
 * exist, so this is approximate near borders). Shared so the owner website names a website
 * event's neighborhood exactly as the app does (the Events tab's "Where" filter, D248).
 */

/** Farther than this from every named point (rural edges), say nothing rather than guess. */
export const NEIGHBORHOOD_MAX_METERS = 5000;

function metersApart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export function nearestNeighborhood(at: { latitude: number; longitude: number }): string | null {
  const here = { lat: at.latitude, lon: at.longitude };
  let best: { name: string; d: number } | null = null;
  for (const [name, lat, lon] of NEIGHBORHOOD_POINTS) {
    const d = metersApart(here, { lat, lon });
    if (!best || d < best.d) best = { name, d };
  }
  return best && best.d <= NEIGHBORHOOD_MAX_METERS ? best.name : null;
}
