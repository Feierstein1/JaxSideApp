/** Longest side after shrinking; more than the server keeps, so no visible loss. */
export const UPLOAD_MAX_SIDE = 2048;

/** The resize that keeps the longest side at most `max` (null if already small enough). */
export function shrinkTo(width: number, height: number, max = UPLOAD_MAX_SIDE) {
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}
