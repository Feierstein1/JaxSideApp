import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from '@jax/shared';
import { ApiRequestError } from './api/client';
import { serverErrors, validate } from './forms';

describe('validate', () => {
  it('returns the first message per field', () => {
    const r = validate(registerRequestSchema, {
      username: 'a',
      email: 'bad',
      password: 'x',
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'password', 'username']);
  });
});

describe('serverErrors', () => {
  it('maps VALIDATION_ERROR details to fields', () => {
    const err = new ApiRequestError(400, 'VALIDATION_ERROR', 'Some fields are invalid', [
      { path: 'username', message: 'Too short' },
    ]);
    expect(serverErrors(err)).toEqual({ username: 'Too short' });
  });

  it('maps other errors to a form message', () => {
    expect(
      serverErrors(new ApiRequestError(409, 'USERNAME_TAKEN', 'That username is taken')),
    ).toEqual({ form: 'That username is taken' });
  });
});
