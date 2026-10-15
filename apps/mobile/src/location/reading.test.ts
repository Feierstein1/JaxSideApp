import { describe, expect, it } from 'vitest';
import { locationReadingSchema } from '@jax/shared';
import { toReading } from './reading';

const base = {
  coords: { latitude: 30.3322, longitude: -81.6557, accuracy: 12.5 },
  timestamp: 1_760_000_000_123.4,
};

describe('toReading', () => {
  it('produces a reading the server schema accepts', () => {
    const r = toReading(base);
    expect(r).toEqual({
      latitude: 30.3322,
      longitude: -81.6557,
      accuracyMeters: 12.5,
      timestamp: 1_760_000_000_123,
    });
    expect(locationReadingSchema.safeParse(r).success).toBe(true);
  });

  it('passes the Android mock-location flag through', () => {
    expect(toReading({ ...base, mocked: true }).mocked).toBe(true);
  });

  it('treats missing accuracy as unusable rather than guessing', () => {
    const r = toReading({ ...base, coords: { ...base.coords, accuracy: null } });
    expect(r.accuracyMeters).toBe(100_000);
  });
});
