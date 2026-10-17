const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

const YARDS_PER_METER = 1.09361;

/**
 * D71: "60 ft", "320 yd", "1.4 mi". Very close in feet, up to a mile in yards (the units
 * the radius setting uses), farther in miles.
 */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  const yards = meters * YARDS_PER_METER;
  if (yards < 100) return `${Math.max(10, Math.round((meters * FEET_PER_METER) / 10) * 10)} ft`;
  if (miles < 1) return `${Math.round(yards / 10) * 10} yd`;
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

/**
 * Post header time (D69): "just now", "5 min ago", "3 hr ago", "2 days ago" for up to
 * 3 days, then the date ("Oct 12", with the year if it isn't this year).
 */
export function postTime(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 3 * 86_400) {
    const d = Math.floor(s / 86_400);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "1 post", "12 posts". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
