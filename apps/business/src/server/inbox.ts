import type { BusinessAccount, BusinessNoticeKind } from '@/generated/prisma/client';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';
import { getMailer } from './mailer';

/**
 * B1.8: the inbox. A place's activity (new posts, new comments, replies to the business)
 * is worked out from the discussion tables since this person last marked it seen, so the
 * app never writes anything for it. Messages from JaxSide (BusinessNotice) are stored.
 * Optional email: a summary at most once a day, sent by `scripts/send-notices.ts`.
 * No phone push (D165).
 */

const EXCERPT = 140;
const SHOW = 10;
const DAY = 86_400_000;

export type PlaceInbox = {
  placeId: string;
  placeName: string;
  since: string;
  newPosts: { id: string; excerpt: string; createdAt: string }[];
  newPostCount: number;
  /** New comments by people (not the business), grouped by post, newest first. */
  commentedPosts: {
    postId: string;
    excerpt: string;
    count: number;
    repliesToUs: number;
    lastAt: string;
  }[];
  newCommentCount: number;
};

export type Notice = {
  id: string;
  kind: BusinessNoticeKind;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

const excerpt = (s: string) => (s.length > EXCERPT ? `${s.slice(0, EXCERPT - 1)}…` : s);

/** Activity at one place after `since`, by people in the app (never the business itself). */
async function placeActivity(placeId: string, since: Date) {
  const [posts, postCount, comments] = await Promise.all([
    db.businessPost.findMany({
      where: { placeId, status: 'VISIBLE', authorId: { not: null }, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: SHOW,
      select: { id: true, body: true, createdAt: true },
    }),
    db.businessPost.count({
      where: { placeId, status: 'VISIBLE', authorId: { not: null }, createdAt: { gt: since } },
    }),
    db.comment.findMany({
      where: {
        businessPost: { placeId, status: 'VISIBLE' },
        status: 'VISIBLE',
        authorKind: { not: 'BUSINESS' },
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        createdAt: true,
        businessPostId: true,
        businessPost: { select: { body: true } },
        parent: { select: { authorKind: true } },
      },
    }),
  ]);
  const byPost = new Map<string, PlaceInbox['commentedPosts'][number]>();
  for (const c of comments) {
    const id = c.businessPostId!;
    const entry = byPost.get(id) ?? {
      postId: id,
      excerpt: excerpt(c.businessPost!.body),
      count: 0,
      repliesToUs: 0,
      lastAt: c.createdAt.toISOString(),
    };
    entry.count += 1;
    if (c.parent?.authorKind === 'BUSINESS') entry.repliesToUs += 1;
    byPost.set(id, entry);
  }
  return {
    newPosts: posts.map((p) => ({
      id: p.id,
      excerpt: excerpt(p.body),
      createdAt: p.createdAt.toISOString(),
    })),
    newPostCount: postCount,
    commentedPosts: [...byPost.values()].slice(0, SHOW),
    newCommentCount: comments.length,
  };
}

/** The live places of this login, with when it last looked at each. */
async function myAccess(accountId: string) {
  return db.businessPlaceAccess.findMany({
    where: { accountId, revokedAt: null, place: { status: 'ACTIVE' } },
    orderBy: { place: { name: 'asc' } },
    select: {
      id: true,
      createdAt: true,
      inboxSeenAt: true,
      place: { select: { id: true, name: true } },
    },
  });
}

export async function getInbox(account: BusinessAccount) {
  const access = await myAccess(account.id);
  const places: PlaceInbox[] = [];
  for (const a of access) {
    const since = a.inboxSeenAt ?? a.createdAt;
    places.push({
      placeId: a.place.id,
      placeName: a.place.name,
      since: since.toISOString(),
      ...(await placeActivity(a.place.id, since)),
    });
  }
  const notices = await db.businessNotice.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return {
    places,
    notices: notices.map((n): Notice => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    })),
  };
}

/** The number shown next to "Inbox": new posts and comments, plus unread notices. */
export async function unreadCount(account: BusinessAccount): Promise<number> {
  const access = await myAccess(account.id);
  let n = await db.businessNotice.count({ where: { accountId: account.id, readAt: null } });
  for (const a of access) {
    const since = a.inboxSeenAt ?? a.createdAt;
    const placeId = a.place.id;
    n += await db.businessPost.count({
      where: { placeId, status: 'VISIBLE', authorId: { not: null }, createdAt: { gt: since } },
    });
    n += await db.comment.count({
      where: {
        businessPost: { placeId, status: 'VISIBLE' },
        status: 'VISIBLE',
        authorKind: { not: 'BUSINESS' },
        createdAt: { gt: since },
      },
    });
  }
  return n;
}

/** "I've seen it": one place's activity (or all places and notices). */
export async function markSeen(account: BusinessAccount, placeId?: string, now = new Date()) {
  if (placeId !== undefined) {
    const res = await db.businessPlaceAccess.updateMany({
      where: { accountId: account.id, placeId, revokedAt: null },
      data: { inboxSeenAt: now },
    });
    if (res.count === 0) throw new ApiError(404, 'NOT_FOUND', 'Place not found.');
    return;
  }
  await db.$transaction([
    db.businessPlaceAccess.updateMany({
      where: { accountId: account.id, revokedAt: null },
      data: { inboxSeenAt: now },
    }),
    db.businessNotice.updateMany({
      where: { accountId: account.id, readAt: null },
      data: { readAt: now },
    }),
  ]);
}

/** Turn the daily summary email on or off (only logins with an email can have it). */
export async function setEmailNotices(account: BusinessAccount, on: boolean) {
  if (on && !account.email) {
    throw new ApiError(
      400,
      'NO_EMAIL',
      'This login has no email address. Ask the Owner to keep an eye on the inbox.',
    );
  }
  await db.businessAccount.update({ where: { id: account.id }, data: { emailNotices: on } });
}

// ───────────────────────────── Daily email ─────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Sends each login that asked for it one summary of what's new since its last summary
 * (and since it last looked), at most once a day. Nothing new, no email. Returns how many
 * were sent. Run every hour or so; the once-a-day rule is enforced here.
 */
export async function sendDigests(now = new Date()): Promise<number> {
  const accounts = await db.businessAccount.findMany({
    where: {
      emailNotices: true,
      email: { not: null },
      revokedAt: null,
      suspendedAt: null,
      OR: [
        { noticesEmailedAt: null },
        { noticesEmailedAt: { lte: new Date(now.getTime() - DAY) } },
      ],
    },
  });
  let sent = 0;
  for (const account of accounts) {
    const access = await myAccess(account.id);
    const lines: string[] = [];
    for (const a of access) {
      const seen = a.inboxSeenAt ?? a.createdAt;
      const since =
        account.noticesEmailedAt && account.noticesEmailedAt > seen
          ? account.noticesEmailedAt
          : seen;
      const act = await placeActivity(a.place.id, since);
      if (act.newPostCount || act.newCommentCount) {
        const parts = [
          act.newPostCount ? plural(act.newPostCount, 'new post', 'new posts') : null,
          act.newCommentCount ? plural(act.newCommentCount, 'new comment', 'new comments') : null,
        ].filter(Boolean);
        lines.push(`${a.place.name}: ${parts.join(' and ')}`);
      }
    }
    const notices = await db.businessNotice.count({
      where: {
        accountId: account.id,
        readAt: null,
        ...(account.noticesEmailedAt ? { createdAt: { gt: account.noticesEmailedAt } } : {}),
      },
    });
    if (notices) lines.push(plural(notices, 'message from JaxSide', 'messages from JaxSide'));
    if (!lines.length) continue;

    await getMailer().send({
      to: account.email!,
      subject: 'New activity at your place on JaxSide',
      text: [
        'Here’s what’s new since your last summary:',
        '',
        ...lines.map((l) => `  • ${l}`),
        '',
        `Read and reply: ${getEnv().BUSINESS_BASE_URL}/inbox`,
        '',
        'You get this at most once a day. Turn it off on the website under "Password, two-step sign-in and emails".',
      ].join('\n'),
    });
    await db.businessAccount.update({
      where: { id: account.id },
      data: { noticesEmailedAt: now },
    });
    sent += 1;
  }
  return sent;
}
