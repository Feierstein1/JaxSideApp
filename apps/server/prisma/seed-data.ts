import type { CONFIG_DEFAULTS } from '@jax/shared';

export const CONFIG_DESCRIPTIONS: Partial<Record<keyof typeof CONFIG_DEFAULTS, string>> = {
  'radius.general.maxMiles': 'Largest general-feed radius a user may choose (§7)',
  'radius.business.maxMiles': 'Largest business-room radius (§7, D19)',
  'age.birthYearOffset': 'Eligible if birthYear <= currentYear - offset (§4.2)',
  'location.maxAgeSeconds': 'Reject location readings older than this (§6.2)',
  'location.maxAccuracyMeters': 'Reject readings with worse accuracy than this (§6.2)',
  'guest.inactivityDays': 'Guest expires after this many inactive days (§5.1)',
  'guest.commentVisibleDays': 'Guest comments hard-deleted after this many days (D17)',
  'comments.limitPerPost': 'A post with this many comments (replies included) takes no more (D105)',

  'rateLimit.login.per15MinPerIp': 'Failed logins allowed per IP per 15 minutes (D29)',
  'rateLimit.login.per15MinPerAccount': 'Failed logins allowed per account per 15 minutes (D29)',
};

/** Initial achievement definitions (P6.8). Criteria are evaluated server-side only. */
/**
 * Starter screening rules (P5.4, D56). Threats and self-harm taunts are held for a
 * moderator, not refused, since context matters (quotes, news). Admins add more,
 * including slurs, in the admin portal (P5.17). Seeding never overwrites admin edits.
 */
export const STARTER_SCREENING_RULES = [
  { term: 'i will kill you', category: 'THREAT', action: 'HOLD' },
  { term: 'im going to kill you', category: 'THREAT', action: 'HOLD' },
  { term: 'gonna kill you', category: 'THREAT', action: 'HOLD' },
  { term: 'i know where you live', category: 'THREAT', action: 'HOLD' },
  { term: 'shoot up the', category: 'THREAT', action: 'HOLD' },
  { term: 'kill yourself', category: 'HARASSMENT', action: 'HOLD' },
  { term: 'kys', category: 'HARASSMENT', action: 'HOLD' },
] as const;

/**
 * Medals (D64, D122). `tiers` are the thresholds for Bronze, Silver, Gold and Platinum (a
 * one-level medal has one); `tierLabels` say what each level takes, for the profile's
 * "next level" line. Editable here (the seed updates definitions) or in the table.
 */
export const ACHIEVEMENTS = [
  {
    key: 'first_contribution',
    name: 'First Contribution',
    description: 'Made a first post or comment that stayed up.',
    icon: 'sparkles',
    criteria: {
      type: 'first_visible_content',
      minAgeHours: 24,
      tiers: [1],
      tierLabels: ['1 post or comment'],
    },
  },
  {
    key: 'well_received',
    name: 'Well Received',
    description: 'Different posts that neighbors voted up to +3 or more.',
    icon: 'thumbs-up',
    criteria: {
      type: 'net_positive_distinct_posts',
      minScoreEach: 3,
      tiers: [5, 25, 100, 250],
      tierLabels: ['5 posts', '25 posts', '100 posts', '250 posts'],
    },
  },
  {
    key: 'approved_contributor',
    name: 'Approved Contributor',
    description: 'Suggested places that were added to the directory.',
    icon: 'map-pin',
    criteria: {
      type: 'approved_submissions',
      tiers: [1, 5, 15, 40],
      tierLabels: ['1 place', '5 places', '15 places', '40 places'],
    },
  },
  {
    key: 'helpful_commenter',
    name: 'Helpful Commenter',
    description: 'Comments that neighbors voted up to +3 or more, on different posts.',
    icon: 'heart',
    criteria: {
      type: 'helpful_comments',
      minScoreEach: 3,
      tiers: [5, 25, 100, 250],
      tierLabels: ['5 comments', '25 comments', '100 comments', '250 comments'],
    },
  },
  {
    key: 'place_verifier',
    name: 'Place Verifier',
    description: 'Votes on new or closed places that matched the final result.',
    icon: 'check',
    criteria: {
      type: 'matched_place_votes',
      tiers: [5, 25, 75, 200],
      tierLabels: ['5 votes', '25 votes', '75 votes', '200 votes'],
    },
  },
  {
    key: 'neighborhood_explorer',
    name: 'Neighborhood Explorer',
    description: 'Posts voted up to +3 or more in different parts of town (ZIP areas).',
    icon: 'compass',
    criteria: {
      type: 'zip_areas_with_good_posts',
      minScoreEach: 3,
      tiers: [3, 6, 12, 20],
      tierLabels: ['3 areas', '6 areas', '12 areas', '20 areas'],
    },
  },
  {
    key: 'longtime_neighbor',
    name: 'Longtime Neighbor',
    description: 'A member in good standing (no suspension or ban in the last 90 days).',
    icon: 'home',
    criteria: {
      type: 'good_standing_days',
      cleanDays: 90,
      tiers: [90, 180, 365, 730],
      tierLabels: ['3 months', '6 months', '1 year', '2 years'],
    },
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
