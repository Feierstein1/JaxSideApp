import { createHash } from 'node:crypto';
import type { User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { hit } from '../rate-limit';
import type { Hold } from './screening';
import { normalizedForms } from './screening';

/**
 * P5.5 duplicate-content and spam checks (§11.3, D57). Runs after text screening on new
 * posts and comments:
 * - Posting the same text again (same author, any post or room, within the window) is
 *   refused. Short replies ("thanks!") are exempt.
 * - Link-heavy text, or any link from a brand-new account, is held for a moderator.
 */

const HOUR_MS = 3_600_000;

/** URLs and bare domains ("example.com", "bit.ly/x"). Exported for tests. */
const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|info|biz|xyz|ly|me|us|app|link|site|online|shop|store|gg|tv|cc)\b(?:\/\S*)?/gi;

export function countLinks(text: string): number {
  return text.match(LINK)?.length ?? 0;
}

const comparable = (text: string) => normalizedForms(text).squashed[0]!;

/** Throws 409 if this author already posted the same text recently. */
async function assertNotDuplicate(user: User, text: string, now: Date) {
  const [minLength, windowHours] = await Promise.all([
    getConfig('spam.duplicateMinLength'),
    getConfig('spam.duplicateWindowHours'),
  ]);
  const mine = comparable(text);
  if (mine.length < minLength) return;
  const since = new Date(now.getTime() - windowHours * HOUR_MS);
  // Bounded by the daily post/comment limits, so this stays small.
  const [general, business, comments] = await Promise.all([
    db.generalPost.findMany({
      where: { authorId: user.id, createdAt: { gte: since }, status: { not: 'DELETED' } },
      select: { body: true },
    }),
    db.businessPost.findMany({
      where: { authorId: user.id, createdAt: { gte: since }, status: { not: 'DELETED' } },
      select: { body: true },
    }),
    db.comment.findMany({
      where: { authorUserId: user.id, createdAt: { gte: since }, status: { not: 'DELETED' } },
      select: { body: true },
    }),
  ]);
  if ([...general, ...business, ...comments].some((r) => comparable(r.body) === mine)) {
    throw new ApiError(
      409,
      'DUPLICATE_CONTENT',
      'You already posted this. Posting the same thing again isn’t allowed.',
    );
  }
}

/**
 * D176: the same long message sent over and over (to one friend or many) is mass messaging.
 * Counted per sender and text for a day, in the rate-limit counters, so no message text is
 * kept or compared. Refused after `rateLimit.messageSame.perDay` copies.
 */
export async function assertNotMassMessage(userId: string, text: string, now = new Date()) {
  const [minLength, limit] = await Promise.all([
    getConfig('spam.duplicateMinLength'),
    getConfig('rateLimit.messageSame.perDay'),
  ]);
  const mine = comparable(text);
  if (mine.length < minLength) return;
  const digest = createHash('sha256').update(mine).digest('hex').slice(0, 32);
  const count = await hit(`message-same:${userId}:${digest}`, 86_400, now);
  if (count > limit) {
    throw new ApiError(
      429,
      'DUPLICATE_MESSAGE',
      'You’ve sent this same message several times already. Please don’t send it again.',
    );
  }
}

/** Link limits. Returns a hold, or null if the links are fine. */
async function linkHold(user: User, text: string, now: Date): Promise<Hold | null> {
  const links = countLinks(text);
  if (links === 0) return null;
  const [maxLinks, newAccountHours] = await Promise.all([
    getConfig('spam.maxLinks'),
    getConfig('spam.newAccountLinkHoldHours'),
  ]);
  if (links > maxLinks) {
    return { reason: 'SPAM', details: `Held automatically: ${links} links (limit ${maxLinks}).` };
  }
  if (now.getTime() - user.createdAt.getTime() < newAccountHours * HOUR_MS) {
    return { reason: 'SPAM', details: 'Held automatically: link from a new account.' };
  }
  return null;
}

/** New posts and comments: refuse duplicates, maybe hold for links. */
export async function checkNewContent(user: User, text: string, now = new Date()) {
  await assertNotDuplicate(user, text, now);
  return linkHold(user, text, now);
}

/** Edits can't be held (D56), so too many links refuses the edit instead. */
export async function checkEdit(text: string) {
  const maxLinks = await getConfig('spam.maxLinks');
  if (countLinks(text) > maxLinks) {
    throw new ApiError(422, 'TOO_MANY_LINKS', `Please include at most ${maxLinks} links.`);
  }
}
