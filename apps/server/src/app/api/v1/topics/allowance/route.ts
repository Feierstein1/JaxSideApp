import { NextResponse } from 'next/server';
import { TOPIC_SCOPES, type TopicScope } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { ApiError, route } from '@/server/http';
import { assertTopicAllowance } from '@/server/topics';

/**
 * D162: can this account start a topic of this kind right now? The app asks before opening
 * the form, so someone still in a waiting period gets one short notice instead of a form
 * that fails. Creating a topic checks the same rules again.
 */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  const scope = new URL(req.url).searchParams.get('scope');
  if (!TOPIC_SCOPES.includes(scope as TopicScope)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown topic kind');
  }
  try {
    await assertTopicAllowance(user, scope as TopicScope);
    return NextResponse.json({ allowed: true });
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'ACCOUNT_TOO_NEW' || e.code === 'TOPIC_LIMIT')) {
      return NextResponse.json({ allowed: false, message: e.message });
    }
    throw e;
  }
});
