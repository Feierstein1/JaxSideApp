import { NextResponse } from 'next/server';
import { locationStatusRequestSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { NO_USER } from '@/server/discussions/comments';
import { listAuthorPosts } from '@/server/discussions/posts';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { getPublicProfile, usernameFrom, type UsernameCtx } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * P4.8: a public profile and the person's recent area posts. Like the feed, it needs an
 * in-Duval reading (D16); guests may view profiles too.
 */
export const POST = route<UsernameCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const username = await usernameFrom(ctx);
  const { reading } = await parseBody(req, locationStatusRequestSchema);
  const subject = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;
  await enforce([
    { key: `feed:${subject}`, limitKey: 'rateLimit.feed.perMinute', windowSeconds: 60 },
  ]);
  const at = await assertLocationEligible(
    actor.kind === 'user'
      ? { kind: 'user', user: actor.user }
      : { kind: 'guest', guest: actor.guest },
    reading,
    'general.read',
  );
  const viewerUserId = actor.kind === 'user' ? actor.user.id : null;
  const { id, profile } = await getPublicProfile(username, viewerUserId);
  const posts = await listAuthorPosts(id, viewerUserId ?? NO_USER, at);
  return NextResponse.json({ profile, posts });
});
