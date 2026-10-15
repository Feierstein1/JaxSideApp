import { beforeEach, describe, expect, it } from 'vitest';
import { POST as statusPOST } from '@/app/api/v1/location/status/route';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { call, captureMailer } from './http-helpers';

let token: string;
beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  setMailer(captureMailer().mailer);
  await importServiceArea(db, readBoundaryFile());
  await call(registerPOST, 'POST', {
    body: {
      username: 'Walker',
      email: 'walker@example.test',
      password: 'correct horse battery',
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    },
  });
  token = (
    await call(loginPOST, 'POST', {
      body: { identifier: 'walker', password: 'correct horse battery' },
    })
  ).body.token;
});

const reading = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  accuracyMeters: 12,
  timestamp: Date.now() - 3_000,
});

describe('POST /api/v1/location/status (P2.9)', () => {
  it('200 inside Duval', async () => {
    const r = await call(statusPOST, 'POST', {
      token,
      body: { reading: reading(30.3322, -81.6557) },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ eligible: true });
  });

  it('403 LOCATION_OUTSIDE_AREA with a readable message outside Duval', async () => {
    const r = await call(statusPOST, 'POST', {
      token,
      body: { reading: reading(30.1661, -81.7065) },
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    expect(r.body.error.message).toMatch(/Duval County/);
  });

  it('requires a session', async () => {
    const r = await call(statusPOST, 'POST', { body: { reading: reading(30.3322, -81.6557) } });
    expect(r.status).toBe(401);
  });

  it('rejects malformed or extra input', async () => {
    const r = await call(statusPOST, 'POST', {
      token,
      body: { reading: { ...reading(30.3322, -81.6557), latitude: 'here' } },
    });
    expect(r.status).toBe(400);
    const r2 = await call(statusPOST, 'POST', {
      token,
      body: { reading: reading(30.3322, -81.6557), userId: 'someone' },
    });
    expect(r2.status).toBe(400);
  });

  it('never echoes the coordinates back', async () => {
    const r = await call(statusPOST, 'POST', {
      token,
      body: { reading: reading(30.3322, -81.6557) },
    });
    expect(r.raw).not.toContain('30.3322');
  });
});
