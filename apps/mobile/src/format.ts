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
