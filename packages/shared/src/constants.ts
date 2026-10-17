/**
 * Shared constants and configuration DEFAULTS.
 *
 * These defaults seed `AppConfiguration` (P1.11). At runtime the server reads the
 * database values, which are authoritative. Clients may use these only for UX hints.
 */

export const METERS_PER_MILE = 1609.344;

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

/** App timezone. Used for calendar-year math such as the age screen (D22). */
export const APP_TIME_ZONE = 'America/New_York';

export const CONFIG_DEFAULTS = {
  // §7 radius table (miles)
  // D71: one radius for everything location-based, at most 0.3 mi (528 yd).
  'radius.general.defaultMiles': 0.3,
  'radius.general.minMiles': 0.1,
  'radius.general.maxMiles': 0.3,
  'radius.business.defaultMiles': 0.3,
  'radius.business.minMiles': 0.1,
  'radius.business.maxMiles': 0.3,

  // §4.2 age screen: birthYear <= currentYear - offset
  'age.birthYearOffset': 19,

  // §6.2 location reading validation
  'location.maxAgeSeconds': 60,
  'location.maxAccuracyMeters': 100,
  /** Readings stamped this far in the future (device clock ahead) are refused. */
  'location.maxClockSkewSeconds': 30,

  // P2.6 / D38 impossible travel. Compares a reading with the actor's previous one.
  'location.travel.lookbackMinutes': 120,
  /** Faster than this (over at least blockMinDistanceKm) is refused + temporary restriction. */
  'location.travel.blockSpeedKmh': 1000,
  'location.travel.blockMinDistanceKm': 5,
  /** Faster than this (over at least flagMinDistanceKm) is flagged for admins only. */
  'location.travel.flagSpeedKmh': 160,
  'location.travel.flagMinDistanceKm': 2,
  'location.travel.restrictMinutes': 15,

  // P2.5 / D14 retention (daily maintenance job)
  'retention.locationCheckDays': 30,
  'retention.expiredSessionDays': 7,
  'retention.usedEmailTokenDays': 7,
  /** D14: expired guest session data kept this long (for ban enforcement), then deleted. */
  'retention.guestDataDays': 180,
  /** D37: deleted-account email kept this long before crypto-shredding (unless on legal hold). */
  'retention.deletedAccountDays': 30,

  // P2.13 / P2.14 directory
  'directory.pageSize': 20,
  /** D69: the Places list only shows places within this distance. */
  'directory.maxListMiles': 0.3,
  /** D69: places with longer names are hidden from the list (and new ones can't be longer). */
  'directory.maxNameLength': 30,
  /** Favorites rank as if this many times closer than they are (D39). */
  'directory.favoriteDistanceFactor': 0.25,
  'favorites.maxPerUser': 200,

  // Phase 3 discussions (D41)
  'feed.pageSize': 15,
  /** "Top" sort looks back this many days. */
  'feed.topWindowDays': 7,
  /** Replies nest at most this deep (0 = top-level comment). */
  'comments.maxDepth': 3,
  /** Comments returned per post (MVP: one page, oldest thread first). */
  'comments.maxPerPost': 300,

  // P5.5 / D57 spam checks
  /** Same text again from the same person within this many hours is refused. */
  'spam.duplicateWindowHours': 24,
  /** Shorter texts ("thanks!") may repeat. Counted after normalization. */
  'spam.duplicateMinLength': 20,
  /** More links than this in one post/comment → held for review. */
  'spam.maxLinks': 2,
  /** Any link from an account younger than this → held for review. */
  'spam.newAccountLinkHoldHours': 24,

  // D73: a post reported by this many different people is hidden until a moderator decides.
  'moderation.autoHideReports': 3,

  // P5.6 / D9 strike ladder
  'strikes.decayDays': 180,
  'strikes.firstSuspensionHours': 24,
  'strikes.secondSuspensionHours': 168,
  /** The strike number that becomes a permanent ban. */
  'strikes.banAtStrike': 4,

  // P5.7 / D59 appeals
  /** Warnings and suspensions can be appealed within this many days. */
  'appeals.windowDays': 30,
  /** After a rejected ban appeal, the person can ask again after this many days. */
  'appeals.banRetryDays': 90,

  // §5.1 / D17 guests
  'guest.inactivityDays': 30,
  'guest.expiryWarningDays': 5,
  'guest.commentVisibleDays': 365,

  // §4.3 usernames
  'username.changeCooldownDays': 30,
  /** A released username stays reserved this long, so nobody can grab it to impersonate. */
  'username.releaseHoldDays': 30,

  // D10 sessions
  'session.mobileDays': 30,
  'session.adminHours': 8,
  'session.adminIdleMinutes': 30,
  'passwordReset.expiryMinutes': 30,
  'emailVerification.expiryHours': 24,
  // D31: 6-digit codes typed into the app.
  'emailCode.expiryMinutes': 15,
  'emailCode.maxAttempts': 5,

  // D8 / §18 rate limits (fixed windows). Enforced in P1.15 / P5.3.
  'rateLimit.register.perHourPerIp': 5,
  // Login limits count failed attempts only (D29).
  'rateLimit.login.per15MinPerAccount': 10,
  'rateLimit.login.per15MinPerIp': 15,
  'rateLimit.passwordReset.perHourPerIp': 5,
  'rateLimit.passwordReset.perHourPerAccount': 3,
  'rateLimit.post.perMinute': 2,
  'rateLimit.post.perDay': 20,
  // §11.3 burst limits (10-second window) on top of per-minute and daily ones (P5.3).
  'rateLimit.post.burstPer10s': 1,
  'rateLimit.comment.burstPer10s': 3,
  'rateLimit.vote.burstPer10s': 15,
  'rateLimit.comment.perMinute': 6,
  'rateLimit.comment.perDay': 100,
  'rateLimit.vote.perMinute': 60,
  'rateLimit.vote.perDay': 1000,
  'rateLimit.upload.perDay': 30,
  /** P6.2 photo limits. */
  'photos.maxUploadMB': 10,
  'photos.maxPerPost': 4,
  // D28: reports are limited for everyone (guests can't report, D54).
  'rateLimit.report.perMinute': 3,
  'rateLimit.report.perDay': 20,
  'rateLimit.appeal.perDay': 3,
  'rateLimit.verifyEmailResend.perHour': 3,
  /** Wrong email codes per IP, across all accounts (D31). */
  'rateLimit.codeAttempt.per15MinPerIp': 20,
  'rateLimit.submission.perDay': 5,
  /** P5.8 risk limits: brand-new accounts wait before suggesting places. */
  'submission.minAccountAgeHours': 24,
  /** At most this many of your suggestions waiting for review at once. */
  'submission.maxPending': 10,
  /** Places within this distance with a similar name are shown as possible duplicates. */
  'submission.duplicateRadiusMeters': 300,
  'rateLimit.guestSession.perDayPerInstallation': 3,
  'rateLimit.guestSession.perHourPerIp': 10,
  'rateLimit.installation.perHourPerIp': 10,
  'rateLimit.locationStatus.perMinute': 30,
  'rateLimit.placeSearch.perMinute': 30,
  'rateLimit.favorite.perMinute': 30,
  'rateLimit.preferences.perMinute': 10,
  'rateLimit.edit.perMinute': 10,
  'rateLimit.profile.perMinute': 10,
  'rateLimit.block.perMinute': 20,
  /** Wrong current-password attempts (password/email change, deletion) per account. */
  'rateLimit.passwordCheck.per15Min': 5,
  /** Wrong admin authenticator codes per account (P5.11). */
  'rateLimit.adminTotp.per15Min': 5,
  /** Admin portal changes per admin (P5.14). Generous; stops runaway scripts. */
  'rateLimit.adminAction.perMinute': 60,
  'rateLimit.feed.perMinute': 60,
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;

/** Version of the Terms of Service users accept at registration (Q11: text pending legal review). */
export const TOS_VERSION = '2026-10-draft';

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** D71: the radius choices people can pick (miles); shown in yards. */
export const RADIUS_OPTIONS_MILES = [0.1, 0.2, 0.3] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS_MILES)[number];

/** "176 yd", "528 yd": distances up to a mile are shown in yards (D71). */
export function yardsLabel(miles: number): string {
  return `${Math.round(miles * 1760)} yd`;
}
