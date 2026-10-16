import type { CONFIG_DEFAULTS } from '@jax/shared';

export const CONFIG_DESCRIPTIONS: Partial<Record<keyof typeof CONFIG_DEFAULTS, string>> = {
  'radius.general.maxMiles': 'Largest general-feed radius a user may choose (§7)',
  'radius.business.maxMiles': 'Largest business-room radius (§7, D19)',
  'age.birthYearOffset': 'Eligible if birthYear <= currentYear - offset (§4.2)',
  'location.maxAgeSeconds': 'Reject location readings older than this (§6.2)',
  'location.maxAccuracyMeters': 'Reject readings with worse accuracy than this (§6.2)',
  'guest.inactivityDays': 'Guest expires after this many inactive days (§5.1)',
  'guest.commentVisibleDays': 'Guest comments hard-deleted after this many days (D17)',
  'rateLimit.login.per15MinPerIp': 'Failed logins allowed per IP per 15 minutes (D29)',
  'rateLimit.login.per15MinPerAccount': 'Failed logins allowed per account per 15 minutes (D29)',
};

/** Initial achievement definitions (P6.8). Criteria are evaluated server-side only. */
export const ACHIEVEMENTS = [
  {
    key: 'first_contribution',
    name: 'First Contribution',
    description: 'Made a first post or comment that stayed up.',
    icon: 'sparkles',
    criteria: { type: 'first_visible_content' },
  },
  {
    key: 'approved_contributor',
    name: 'Approved Contributor',
    description: 'Suggested a place that was approved for the directory.',
    icon: 'map-pin',
    criteria: { type: 'submission_approved' },
  },
  {
    key: 'well_received',
    name: 'Well Received',
    description: 'Net-positive votes across several different posts.',
    icon: 'thumbs-up',
    criteria: { type: 'net_positive_distinct_posts', minPosts: 5, minScoreEach: 3 },
  },
] as const;

/** Dev accounts. Password comes from SEED_DEV_PASSWORD. The admin still needs TOTP (P5.11). */
export const DEV_USERS = [
  {
    username: 'dev_alice',
    email: 'alice@dev.test',
    role: 'USER',
    verified: true,
    bio: 'Riverside regular',
  },
  { username: 'dev_bob', email: 'bob@dev.test', role: 'USER', verified: false, bio: null },
  { username: 'dev_admin', email: 'admin@dev.test', role: 'ADMIN', verified: true, bio: null },
] as const;

/** A few well-known public places for local development (sourceName "dev-seed"). */
export const DEV_PLACES = [
  { sourceId: 'jax-1', name: 'Hemming Park', category: 'park', lat: 30.3274, lng: -81.6588 },
  {
    sourceId: 'jax-2',
    name: 'Riverside Arts Market',
    category: 'market',
    lat: 30.3165,
    lng: -81.6798,
  },
  {
    sourceId: 'jax-3',
    name: 'Jacksonville Beach Pier',
    category: 'attraction',
    lat: 30.2856,
    lng: -81.3884,
  },
  { sourceId: 'jax-4', name: 'Five Points Coffee', category: 'cafe', lat: 30.3149, lng: -81.6853 },
  { sourceId: 'jax-5', name: 'Memorial Park', category: 'park', lat: 30.3088, lng: -81.6823 },
] as const;
