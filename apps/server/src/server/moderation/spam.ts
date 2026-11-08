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
 * - D219: a link of any kind is refused (posts, comments, edits, messages, area chat).
 */

const HOUR_MS = 3_600_000;

/**
 * URLs and bare domains ("example.com", "bit.ly/x"). Two-letter endings that are also common
 * words ("it", "is", "to", "in") are left out so ordinary sentences are not refused.
 */
const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|info|biz|xyz|ly|me|us|app|link|site|online|shop|store|gg|tv|cc|dev|ai|page|click|top|win|pro|club|live|life|world|today|news|tech|blog|art|fun|vip|cloud|lol|one|ws|fm|sh|gl|tk|ru|cn|uk|de|ca|eu|gift|bid|loan|work|party|review|trade|date|download|stream|racing|science|website|space|icu|buzz|cam|rest|bar)\b(?:\/\S*)?/gi;

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

/** D219: no links of any kind. */
export function assertNoLinks(text: string) {
  if (countLinks(text)) {
    throw new ApiError(
      422,
      'NO_LINKS',
      'Links aren’t allowed on JaxSide. Please describe it in words instead.',
    );
  }
}

/** New posts and comments: refuse duplicates and links. (Nothing is held for links any more.) */
export async function checkNewContent(
  user: User,
  text: string,
  now = new Date(),
): Promise<Hold | null> {
  await assertNotDuplicate(user, text, now);
  assertNoLinks(text);
  return null;
}

/** Edits too: a link can't be added to a visible post afterwards. */
export async function checkEdit(text: string) {
  assertNoLinks(text);
}
