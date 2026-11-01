import { beforeEach, describe, expect, it } from 'vitest';
import { POST as codeLoginRoute } from '@/app/api/auth/two-factor/login/route';
import { POST as confirmRoute } from '@/app/api/auth/two-factor/confirm/route';
import { POST as disableRoute } from '@/app/api/auth/two-factor/disable/route';
import { POST as setupRoute } from '@/app/api/auth/two-factor/setup/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { db } from '@/server/db';
import { timeStep, totpAt } from '@/server/totp';
import {
  PASSWORD,
  authed,
  cookiesFrom,
  makeAccount,
  post,
  resetBusinessData,
  signIn,
  type Browser,
} from './helpers';

beforeEach(resetBusinessData);

const codeAt = (secret: string, offsetSteps = 0) =>
  totpAt(secret, timeStep(new Date()) + offsetSteps);

/** Turns two-step sign-in on for a signed-in browser; returns the secret. */
async function turnOn(s: Browser): Promise<string> {
  const setup = await setupRoute(authed('POST', '/api/auth/two-factor/setup', s), {});
  expect(setup.status).toBe(200);
  const { secret, qrSvg, otpauthUrl } = await setup.json();
  expect(qrSvg).toMatch(/<svg/);
  expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  const ok = await confirmRoute(
    authed('POST', '/api/auth/two-factor/confirm', s, { code: codeAt(secret, -1) }),
    {},
  );
  expect(ok.status).toBe(200);
  return secret;
}

describe('two-step sign-in', () => {
  it('is off until a code confirms the set-up, and the secret is stored encrypted', async () => {
    await makeAccount();
    const s = await signIn();
    const setup = await setupRoute(authed('POST', '/api/auth/two-factor/setup', s), {});
    const { secret } = await setup.json();
    let row = await db.businessAccount.findFirstOrThrow();
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpSecretEnc).not.toContain(secret);

    const wrong = await confirmRoute(
      authed('POST', '/api/auth/two-factor/confirm', s, { code: '000000' }),
      {},
    );
    expect(wrong.status).toBe(401);
    await confirmRoute(
      authed('POST', '/api/auth/two-factor/confirm', s, { code: codeAt(secret) }),
      {},
    );
    row = await db.businessAccount.findFirstOrThrow();
    expect(row.totpEnabledAt).not.toBeNull();
    expect(
      (await (await meRoute(authed('GET', '/api/auth/me', s), {})).json()).account,
    ).toMatchObject({
      twoFactorOn: true,
    });
  });

  it('once on, the password alone gives no session, only a challenge', async () => {
    await makeAccount();
    const secret = await turnOn(await signIn());
    const step1 = await signIn();
    expect(step1.res.status).toBe(200);
    expect(step1.raw).toHaveLength(0);
    const { twoFactor, challenge } = await step1.res.json();
    expect(twoFactor).toBe(true);

    const bad = await codeLoginRoute(
      post('/api/auth/two-factor/login', { challenge, code: '123456' }),
      {},
    );
    expect(bad.status).toBe(401);

    const good = await codeLoginRoute(
      post('/api/auth/two-factor/login', { challenge, code: codeAt(secret) }),
      {},
    );
    expect(good.status).toBe(200);
    const s = cookiesFrom(good);
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(200);
  });

  it('a code works once (no replay) and a tampered challenge is refused', async () => {
    await makeAccount();
    const secret = await turnOn(await signIn());
    const { challenge } = await (await signIn()).res.json();
    const code = codeAt(secret, 1);
    const first = await codeLoginRoute(post('/api/auth/two-factor/login', { challenge, code }), {});
    expect(first.status).toBe(200);
    const again = await codeLoginRoute(post('/api/auth/two-factor/login', { challenge, code }), {});
    expect(again.status).toBe(401);

    const { challenge: c2 } = await (await signIn()).res.json();
    const parts = c2.split('.');
    parts[0] = '00000000-0000-7000-8000-000000000000';
    const forged = await codeLoginRoute(
      post('/api/auth/two-factor/login', { challenge: parts.join('.'), code: codeAt(secret) }),
      {},
    );
    expect(forged.status).toBe(401);
    expect((await forged.json()).error.code).toBe('CHALLENGE_EXPIRED');
  });

  it('turning it off needs the password and a current code', async () => {
    await makeAccount();
    const s = await signIn();
    const secret = await turnOn(s);
    const off = (password: string, code: string) =>
      disableRoute(authed('POST', '/api/auth/two-factor/disable', s, { password, code }), {}).then(
        (r) => r.status,
      );
    expect(await off('wrong password!', codeAt(secret, 1))).toBe(400);
    expect(await off(PASSWORD, '000000')).toBe(401);
    expect(await off(PASSWORD, codeAt(secret, 1))).toBe(200);
    const row = await db.businessAccount.findFirstOrThrow();
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpSecretEnc).toBeNull();
    expect((await signIn()).raw.length).toBeGreaterThan(0);
  });
});
