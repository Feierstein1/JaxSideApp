const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

/** "250 ft", "0.4 mi", "12 mi". Close places in feet, the rest in miles. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.max(10, Math.round((meters * FEET_PER_METER) / 10) * 10)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** "fast_food" → "Fast food". */
export function categoryLabel(category: string): string {
  const words = category.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "now", "5m", "3h", "2d", "Oct 4" (older than a week). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "1 post", "12 posts". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
