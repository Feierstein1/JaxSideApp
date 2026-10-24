import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_DEFAULTS } from '@jax/shared';
import { db } from '@/server/db';
import { getConfig, invalidateConfigCache } from '@/server/config';
import { verifyPassword } from '@/server/auth/crypto';
import { seed } from '../prisma/seed';
import { ACHIEVEMENTS, DEV_PLACES } from '../prisma/seed-data';
import { resetDb } from './db-helpers';

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
});

describe('seed', { timeout: 20_000 }, () => {
  it('is idempotent: running twice gives the same counts', async () => {
    await seed(db, { includeDevData: true });
    const first = [
      await db.appConfiguration.count(),
      await db.achievement.count(),
      await db.businessPlace.count(),
    ];
    await seed(db, { includeDevData: true });
    const second = [
      await db.appConfiguration.count(),
      await db.achievement.count(),
      await db.businessPlace.count(),
    ];
    expect(second).toEqual(first);
    expect(first).toEqual([
      Object.keys(CONFIG_DEFAULTS).length,
      ACHIEVEMENTS.length,
      DEV_PLACES.length,
    ]);
  });

  it('does not overwrite a config value an admin changed', async () => {
    await seed(db, { includeDevData: false });
    await db.appConfiguration.update({
      where: { key: 'age.birthYearOffset' },
      data: { value: 20 },
    });
    await seed(db, { includeDevData: false });
    const row = await db.appConfiguration.findUniqueOrThrow({
      where: { key: 'age.birthYearOffset' },
    });
    expect(row.value).toBe(20);
  });

  it('creates dev users only with a dev password, idempotently, with a working hash', async () => {
    await seed(db, { includeDevData: true });
    expect(await db.user.count()).toBe(0);
    await seed(db, { includeDevData: true, devPassword: 'dev password 123' });
    await seed(db, { includeDevData: true, devPassword: 'dev password 123' });
    expect(await db.user.count()).toBe(3);
    const admin = await db.user.findUniqueOrThrow({ where: { usernameNormalized: 'dev_admin' } });
    expect(admin.role).toBe('ADMIN');
    expect(await verifyPassword(admin.passwordHash, 'dev password 123')).toBe(true);
  });

  it('skips dev places when includeDevData is false', async () => {
    await seed(db, { includeDevData: false });
    expect(await db.businessPlace.count()).toBe(0);
  });

  it('seeds the §7 radius table and age offset 19', async () => {
    await seed(db, { includeDevData: false });
    expect(await getConfig('radius.general.maxMiles')).toBe(0.3); // D71
    expect(await getConfig('radius.business.maxMiles')).toBe(0.3);
    expect(await getConfig('age.birthYearOffset')).toBe(19);
  });
});

describe('getConfig', () => {
  it('prefers the database value over the default', async () => {
    await db.appConfiguration.create({ data: { key: 'guest.inactivityDays', value: 14 } });
    expect(await getConfig('guest.inactivityDays')).toBe(14);
  });

  it('falls back to the default when the key is missing', async () => {
    expect(await getConfig('guest.inactivityDays')).toBe(30);
  });

  it('falls back to the default when the stored type is wrong', async () => {
    await db.appConfiguration.create({ data: { key: 'age.birthYearOffset', value: 'nineteen' } });
    expect(await getConfig('age.birthYearOffset')).toBe(19);
  });
});
