import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  passwordResetCodeSchema,
  registerRequestSchema,
  verifyEmailCodeSchema,
} from './auth';

const valid = {
  username: 'river_rat',
  email: 'Someone@Example.com',
  password: 'correct horse battery',
  birthYear: 1990,
  acceptTerms: true,
  confirmAdult: true,
};

describe('registerRequestSchema', () => {
  it('accepts a valid request and normalizes email', () => {
    const parsed = registerRequestSchema.parse(valid);
    expect(parsed.email).toBe('someone@example.com');
  });

  // 🔒 Client must not be able to smuggle server-controlled fields.
  it.each([
    ['role', 'ADMIN'],
    ['status', 'ACTIVE'],
    ['id', 'abc'],
    ['emailVerifiedAt', '2020-01-01'],
  ])('rejects unexpected field %s', (field, value) => {
    const result = registerRequestSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(21)],
    ['bad chars', 'river rat!'],
    ['reserved', 'Admin'],
    ['reserved (case/space)', '  GUEST '],
  ])('rejects username: %s', (_label, username) => {
    expect(registerRequestSchema.safeParse({ ...valid, username }).success).toBe(false);
  });

  it('requires ToS acceptance and 18+ confirmation to be literally true', () => {
    expect(registerRequestSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, confirmAdult: 'true' }).success).toBe(false);
  });

  it('enforces password length bounds', () => {
    expect(registerRequestSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(
      false,
    );
  });

  it('rejects non-integer birth year', () => {
    expect(registerRequestSchema.safeParse({ ...valid, birthYear: 1990.5 }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, birthYear: '1990' }).success).toBe(false);
  });
});

describe('emailCodeSchema (D31)', () => {
  it.each(['482913', '482 913', '482-913', ' 482913 '])('accepts %j as 482913', (code) => {
    expect(verifyEmailCodeSchema.parse({ code }).code).toBe('482913');
  });

  it.each(['48291', '4829130', 'abcdef', '', '48291x'])('rejects %j', (code) => {
    expect(verifyEmailCodeSchema.safeParse({ code }).success).toBe(false);
  });

  it('reset-by-code rejects unexpected fields', () => {
    expect(
      passwordResetCodeSchema.safeParse({
        email: 'a@b.com',
        code: '123456',
        newPassword: 'long enough pw',
        userId: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('rejects unexpected fields', () => {
    expect(
      loginRequestSchema.safeParse({ identifier: 'a', password: 'b', userId: 'x' }).success,
    ).toBe(false);
  });
});
