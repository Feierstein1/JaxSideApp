import { beforeEach, describe, expect, it } from 'vitest';
import { POST as featurePOST } from '@/app/api/v1/admin/polls/[id]/feature/route';
import { GET as pollsGET } from '@/app/api/v1/polls/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { createPoll } from '@/server/polls';
import { adminHeaders } from './admin-helpers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D150: one Poll of the week, picked by an admin; Home shows it first.

const HOUR = 3_600_000;
let admin: Record<string, string>;
let adminId: string;
const poll = (question: string, opensIn = -HOUR, closesIn = 7 * 24 * HOUR) =>
  createPoll(adminId, {
    kind: 'yes_no',
    includeUnsure: false,
    topic: 'other',
    question,
    opensAt: new Date(Date.now() + opensIn).toISOString(),
    closesAt: new Date(Date.now() + closesIn).toISOString(),
  });
const feature = (id: string, featured: boolean, headers = admin) =>
  call(featurePOST as H, 'POST', { headers, id, body: { featured } });

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  adminId = (await createTestUser('pf_admin', { role: 'ADMIN' })).id;
  admin = await adminHeaders(adminId);
});

describe('Poll of the week (D150)', () => {
  it('is one poll at a time; featuring another replaces it', async () => {
    const a = await poll('Should the Riverwalk get more lights?');
    const b = await poll('Best beach in Duval?');
    expect((await feature(a, true)).status).toBe(200);
    expect((await feature(b, true)).status).toBe(200);
    const viewer = await createTestUser('pf_viewer', { emailVerifiedAt: new Date() });
    const token = (await createSession(viewer.id, 'MOBILE')).token;
    const open = (await call(pollsGET as H, 'GET', { token })).body.open as {
      id: string;
      featured: boolean;
    }[];
    expect(open.filter((p) => p.featured).map((p) => p.id)).toEqual([b]);
    await feature(b, false);
    expect(await db.poll.count({ where: { featuredAt: { not: null } } })).toBe(0);
    expect(await db.adminAuditLog.count({ where: { action: 'POLL_FEATURED' } })).toBe(2);
  });

  it('can’t feature a closed poll', async () => {
    const p = await poll('Old question', -48 * HOUR, -24 * HOUR);
    expect((await feature(p, true)).body.error.code).toBe('POLL_CLOSED');
  });

  // 🔒 Admins only.
  it('refuses app users', async () => {
    const p = await poll('Should this be featured?');
    const u = await createTestUser('pf_user', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    expect((await feature(p, true, { authorization: `Bearer ${token}` })).status).toBe(401);
    expect(await db.poll.count({ where: { featuredAt: { not: null } } })).toBe(0);
  });
});
