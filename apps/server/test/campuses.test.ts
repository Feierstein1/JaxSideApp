import { beforeEach, describe, expect, it } from 'vitest';
import { categoryGroup, SUBMIT_CATEGORIES, submissionCreateSchema } from '@jax/shared';
import { POST as submitPOST } from '@/app/api/v1/submissions/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { buildOverpassQuery, categorize } from '@/server/directory/osm';
import { markerStyles } from '@/server/map/icons';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D149: college and university campuses come from map data; schools are never places.

describe('campuses from map data (D149)', () => {
  it('imports universities and colleges as campuses, and never K-12 schools', () => {
    expect(categorize({ amenity: 'university', name: 'UNF' })).toBe('campus');
    expect(categorize({ amenity: 'college', name: 'FSCJ Downtown' })).toBe('campus');
    expect(categorize({ amenity: 'school', name: 'Lee High School' })).toBeNull();
    expect(categorize({ amenity: 'kindergarten', name: 'Little Stars' })).toBeNull();
    const q = buildOverpassQuery([30, -82, 30.6, -81.3]);
    expect(q).toContain('university');
    expect(q).not.toMatch(/\bschool\b/);
  });

  it('has its own group, color and map marker', () => {
    expect(categoryGroup('campus')).toBe('campus');
    expect(markerStyles().campus).toMatchObject({ code: 62812, color: '#5D1049' });
  });
});

describe('people can’t add schools or campuses (D149)', () => {
  const SPOT = { latitude: 30.3149, longitude: -81.6853 };
  let token: string;
  beforeEach(async () => {
    await resetDb();
    await relaxBurstLimits();
    await importServiceArea(db, readBoundaryFile());
    invalidateConfigCache();
    const u = await createTestUser('camp_u', {
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - 10 * 86_400_000),
    });
    token = (await createSession(u.id, 'MOBILE')).token;
  }, 60_000);
  const suggest = (name: string, category = 'other') =>
    call(submitPOST as H, 'POST', {
      token,
      body: {
        reading: { ...SPOT, accuracyMeters: 10, timestamp: Date.now() - 2_000 },
        name,
        category,
      },
    });

  // 🔒 Not as a category, and not by name under "other".
  it('refuses the campus category and school-like names; similar words are fine', () => {
    expect(SUBMIT_CATEGORIES).not.toContain('campus');
    const parsed = submissionCreateSchema.safeParse({
      reading: { ...SPOT, accuracyMeters: 10, timestamp: Date.now() },
      name: 'UNF',
      category: 'campus',
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses school and campus names, allows everything else', async () => {
    for (const name of [
      'Lee High School',
      'Sunshine Daycare',
      'FSCJ Campus',
      'Edward Waters University',
    ]) {
      const r = await suggest(name);
      expect(r.body.error?.code, name).toBe('SCHOOLS_NOT_ALLOWED');
    }
    expect((await suggest('Schoolhouse Pizza', 'restaurant')).status).toBe(201);
    expect(await db.businessSubmission.count()).toBe(1);
  });
});
