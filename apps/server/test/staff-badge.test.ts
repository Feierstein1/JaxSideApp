import { beforeEach, describe, expect, it } from 'vitest';
import { POST as actionPOST } from '@/app/api/v1/admin/users/[id]/actions/route';
import { PATCH as profilePATCH } from '@/app/api/v1/me/profile/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { POST as postDetailPOST } from '@/app/api/v1/posts/[id]/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D141: the ADMIN badge, set in the portal, shown on posts, comments and the profile.
const DAY = 86_400_000;
const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let admin: Record<string, string>;
let staff: { id: string; token: string };
let other: { id: string; token: string };

async function person(name: string) {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const badge = (id: string, on: boolean, headers = admin) =>
  call(actionPOST as H, 'POST', {
    headers,
    id,
    body: { action: 'staffBadge', on, reason: 'Community manager' },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  admin = await adminHeaders((await createTestUser('sb_admin', { role: 'ADMIN' })).id);
  staff = await person('sb_staff');
  other = await person('sb_other');
}, 60_000);

describe('the ADMIN badge (D141)', () => {
  it('shows on their posts, comments and profile once the portal turns it on', async () => {
    const post = await call(postsPOST as H, 'POST', {
      token: staff.token,
      body: { reading: reading(), body: 'Reminder: keep it neighborly.' },
    });
    const postId = post.body.post.id as string;
    await call(commentPOST as H, 'POST', {
      token: staff.token,
      id: postId,
      body: { reading: reading(), body: 'Thanks everyone.' },
    });
    const feedAuthor = async () =>
      (await call(feedPOST as H, 'POST', { token: other.token, body: { reading: reading() } })).body
        .posts[0].author;
    expect((await feedAuthor()).admin).toBeUndefined();

    expect((await badge(staff.id, true)).status).toBe(200);
    expect(await feedAuthor()).toMatchObject({ username: 'sb_staff', admin: true });
    const detail = await call(postDetailPOST as H, 'POST', {
      token: other.token,
      id: postId,
      body: { reading: reading() },
    });
    expect(detail.body.comments[0].author).toMatchObject({ username: 'sb_staff', admin: true });
    const profile = await call(profilePOST as H, 'POST', {
      token: other.token,
      params: { username: 'sb_staff' },
      body: { reading: reading() },
    });
    expect(profile.body.profile.admin).toBe(true);

    // It's only a label: no admin access comes with it.
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).role).toBe('USER');
    await badge(staff.id, false);
    expect((await feedAuthor()).admin).toBeUndefined();
    const logs = await db.adminAuditLog.findMany({ where: { action: 'USER_STAFFBADGE' } });
    expect(logs).toHaveLength(2);
  });

  // 🔒 Nobody gives it to themselves.
  it('can only be set by an admin in the portal', async () => {
    expect((await badge(staff.id, true, { authorization: `Bearer ${staff.token}` })).status).toBe(
      401,
    );
    const self = await call(profilePATCH as H, 'PATCH', {
      token: staff.token,
      body: { bio: 'hi', staffBadge: true },
    });
    expect(self.status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).staffBadge).toBe(false);
  });
});
