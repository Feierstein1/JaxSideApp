import { NextResponse } from 'next/server';
import { normalizeUsername, profileRequestSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { NO_USER } from '@/server/discussions/comments';
import { listAuthorPosts, listMyPosts } from '@/server/discussions/posts';
import { ApiError, route } from '@/server/http';
import { assertLocationEligible, type GeoPoint } from '@/server/location/eligibility';
import { getPublicProfile, usernameFrom, type UsernameCtx } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * P4.8: a public profile and the person's recent area posts. Like the feed, it needs an
 * in-Duval reading (D16); guests may view profiles too. D105: your own profile works from
 * anywhere and lists all your posts (area and place).
 */
export const POST = route<UsernameCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const username = await usernameFrom(ctx);
  const { reading, cursor } = await parseBody(req, profileRequestSchema);
  const subject = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;
  await enforce([
    { key: `feed:${subject}`, limitKey: 'rateLimit.feed.perMinute', windowSeconds: 60 },
  ]);
  const me =
    actor.kind === 'user' && normalizeUsername(actor.user.username) === normalizeUsername(username);
  let at: GeoPoint | undefined;
  try {
    at = await assertLocationEligible(
      actor.kind === 'user'
        ? { kind: 'user', user: actor.user }
        : { kind: 'guest', guest: actor.guest },
      reading,
      'general.read',
    );
  } catch (e) {
    if (!(me && e instanceof ApiError)) throw e;
  }
  const viewerUserId = actor.kind === 'user' ? actor.user.id : null;
  const { id, profile } = await getPublicProfile(username, viewerUserId);
  // D112: a page of posts (10) and a bookmark for "Load more posts".
  const page =
    me && viewerUserId
      ? await listMyPosts(viewerUserId, at, cursor)
      : await listAuthorPosts(id, viewerUserId ?? NO_USER, at!, cursor);
  return NextResponse.json({ profile, ...page });
});
