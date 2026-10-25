import { beforeEach, describe, expect, it } from 'vitest';
import { PATCH as rulePATCH } from '@/app/api/v1/admin/screening/[id]/route';
import { POST as ruleCreatePOST } from '@/app/api/v1/admin/screening/route';
import { POST as ruleTestPOST } from '@/app/api/v1/admin/screening/test/route';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import {
  invalidateScreeningCache,
  normalizeTerm,
  strongestMatch,
} from '@/server/moderation/screening';
import { starterSlurTerms } from '../prisma/seed';
import { adminHeaders } from './admin-helpers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// P15.9: the starter slur list and the admin Screening page.

describe('the starter list', () => {
  const terms = starterSlurTerms();

  it('is well formed: unique, matchable, slurs only, block or hold', () => {
    expect(terms.length).toBeGreaterThan(50);
    expect(new Set(terms.map((t) => `${t.term}|${t.match}`)).size).toBe(terms.length);
    for (const t of terms) {
      expect(normalizeTerm(t.term)).not.toBe('');
      expect(t.category).toBe('SLUR');
      expect(['BLOCK', 'HOLD']).toContain(t.action);
    }
  });

  it('leaves ordinary swearing alone (D56)', () => {
    const words = new Set(terms.map((t) => normalizeTerm(t.term)));
    for (const w of ['shit', 'fuck', 'damn', 'ass', 'bitch', 'hell'])
      expect(words.has(w)).toBe(false);
  });

  describe('loaded as rules', () => {
    beforeEach(async () => {
      await resetDb();
      await db.screeningRule.createMany({
        data: terms.map(({ term, match, action, category }) => ({ term, match, action, category })),
      });
      invalidateScreeningCache();
    });

    it('blocks a slur even when disguised; holds a term with innocent uses; allows swearing', async () => {
      expect((await strongestMatch('what a k1ke'))?.action).toBe('BLOCK');
      expect((await strongestMatch('what a k i k e'))?.action).toBe('BLOCK');
      expect((await strongestMatch('my coon hound is loud'))?.action).toBe('HOLD');
      expect(await strongestMatch('this traffic is shit, damn it')).toBeNull();
      expect(await strongestMatch('the Spice Girls and a spicy taco')).toBeNull(); // not "spic"
    });
  });
});

describe('the Screening page', () => {
  let admin: Record<string, string>;
  beforeEach(async () => {
    await resetDb();
    invalidateScreeningCache();
    admin = await adminHeaders((await createTestUser('scr_admin', { role: 'ADMIN' })).id);
  });

  const add = (body: Record<string, unknown>) =>
    call(ruleCreatePOST as H, 'POST', { headers: admin, body });
  const test = async (text: string) =>
    (await call(ruleTestPOST as H, 'POST', { headers: admin, body: { text } })).body;

  it('adds a term (once), tests text, turns it off and on, changes its action', async () => {
    const r = await add({ term: 'zorbcake', action: 'HOLD', category: 'OTHER' });
    expect(r.status).toBe(201);
    expect((await add({ term: 'zorbcake', action: 'BLOCK', category: 'OTHER' })).status).toBe(409);
    expect(await test('total z0rbcake move')).toMatchObject({
      outcome: 'held',
      matches: [{ term: 'zorbcake', enabled: true }],
    });
    // Takes effect right away for posting too.
    expect((await strongestMatch('zorbcake'))?.action).toBe('HOLD');

    const off = await call(rulePATCH as H, 'PATCH', {
      headers: admin,
      id: r.body.id,
      body: { enabled: false },
    });
    expect(off.status).toBe(200);
    expect(await strongestMatch('zorbcake')).toBeNull();
    expect(await test('zorbcake')).toMatchObject({
      outcome: 'allowed',
      matches: [{ term: 'zorbcake', enabled: false }],
    });
    await call(rulePATCH as H, 'PATCH', {
      headers: admin,
      id: r.body.id,
      body: { enabled: true, action: 'BLOCK' },
    });
    expect((await test('zorbcake')).outcome).toBe('blocked');
    // The audit log records the change, never the term itself.
    const logs = await db.adminAuditLog.findMany({
      where: { action: { startsWith: 'SCREENING_' } },
    });
    expect(logs).toHaveLength(3);
    expect(JSON.stringify(logs)).not.toContain('zorbcake');
  });

  it('validates input', async () => {
    expect((await add({ term: 'x', action: 'BLOCK', category: 'OTHER' })).status).toBe(400);
    expect((await add({ term: '!!!', action: 'BLOCK', category: 'OTHER' })).status).toBe(400);
    expect((await add({ term: 'okay term', action: 'DELETE', category: 'OTHER' })).status).toBe(
      400,
    );
    expect((await add({ term: 'okay term', action: 'BLOCK', category: 'MEAN' })).status).toBe(400);
  });

  // 🔒 Admins only.
  it('refuses app users', async () => {
    const u = await createTestUser('scr_user', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    const r = await call(ruleCreatePOST as H, 'POST', {
      token,
      body: { term: 'something', action: 'BLOCK', category: 'OTHER' },
    });
    expect(r.status).toBe(401);
    expect(await db.screeningRule.count()).toBe(0);
  });
});
