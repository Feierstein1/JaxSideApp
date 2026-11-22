import { yardsLabel, type AdWhy } from '@jax/shared';

/**
 * D276 (Apple 2.5.18): everything that decided this ad reached you, in plain words. JaxSide
 * targets only by where you are and your own choices in the app; nothing else is used.
 */
export function adWhyText(why: AdWhy, sponsor: string): string {
  const lines: string[] = [];
  if (why.boosted) {
    lines.push(`${sponsor} boosted this ad, so it's shown more, across Jacksonville.`);
  } else if (why.reach === 'citywide') {
    lines.push(`${sponsor} chose to show this ad across Jacksonville.`);
  } else if (why.reach === 'near') {
    const near = why.nearMeters ? yardsLabel(why.nearMeters / 1609.344) : 'a short distance';
    lines.push(
      `${sponsor} chose to show this ad to people within about ${near} of it, and you're nearby.`,
    );
  } else {
    lines.push(
      why.zip
        ? `${sponsor} chose to show this ad in ZIP code ${why.zip}, where you are now.`
        : `${sponsor} chose to show this ad in the ZIP code where you are now.`,
    );
  }
  if (why.favorite) lines.push('You favorited this place, so its ads come up a little more often.');
  if (why.interested) {
    lines.push('You marked this business’s ads Interested, so they come up a little more often.');
  }
  lines.push(
    'That’s all JaxSide uses: your location right now (not saved) and your own choices in the app. Your age, profile, posts and activity outside JaxSide are never used, and advertisers never learn who you are.',
  );
  return lines.join('\n\n');
}
