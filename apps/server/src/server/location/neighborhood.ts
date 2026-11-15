/**
 * D72: the "Near Avondale" label. Shown only to that person, about their own location; never
 * stored or attached to posts. D247: the points and the rule live in `@jax/shared` (the owner
 * website names its events' neighborhoods with the same function).
 */
export { NEIGHBORHOOD_MAX_METERS, nearestNeighborhood } from '@jax/shared';

export function metersBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
