import { describe, expect, it } from 'vitest';
import { findForbiddenKeys, toMe, toPublicUser } from './serializers';

// A DB row with every sensitive column populated.
const row = {
  id: 'u1',
  username: 'RiverRat',
  usernameNormalized: 'riverrat',
  email: 'river@example.test',
  emailVerifiedAt: new Date('2026-01-01'),
  passwordHash: '$argon2id$v=19$secret',
  birthYear: 1990,
  role: 'ADMIN',
  status: 'SUSPENDED',
  suspendedUntil: new Date('2030-01-01'),
  totpSecretEnc: 'enc',
  createdAt: new Date('2026-01-01'),
  profile: { bio: 'hi', avatarPhotoId: null },
};

describe('serializers (P1.19)', () => {
  // 🔒 Public output is an allow-list: exactly these keys, nothing else.
  it('toPublicUser exposes only the allow-listed fields', () => {
    const out = toPublicUser(row);
    expect(Object.keys(out).sort()).toEqual(['bio', 'id', 'joinedAt', 'username']);
    expect(findForbiddenKeys(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/argon2|1990|river@|ADMIN|SUSPENDED/);
  });

  it('toMe adds the owner email but nothing else private', () => {
    const out = toMe(row);
    expect(findForbiddenKeys(out)).toEqual(['email']);
    expect(JSON.stringify(out)).not.toMatch(/argon2|1990|ADMIN|SUSPENDED|enc"/);
  });

  it('findForbiddenKeys finds nested leaks', () => {
    expect(findForbiddenKeys({ a: [{ b: { birthYear: 1 } }], passwordHash: 'x' }).sort()).toEqual([
      'birthYear',
      'passwordHash',
    ]);
  });
});
