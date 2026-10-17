import { describe, expect, it } from 'vitest';
import { MOVED_METERS } from './moved';
import { metersBetween } from './distance';

describe('distance for the "moved since last load" check (D73)', () => {
  const here = { latitude: 30.3149, longitude: -81.6853 };
  it('measures short distances accurately', () => {
    // 0.001° of latitude ≈ 111 m.
    expect(metersBetween(here, { ...here, latitude: here.latitude + 0.001 })).toBeCloseTo(111, 0);
  });
  it('GPS jitter (~20 m) is not a move; a block (~110 m) is', () => {
    expect(metersBetween(here, { ...here, latitude: here.latitude + 0.0002 })).toBeLessThan(
      MOVED_METERS,
    );
    expect(metersBetween(here, { ...here, latitude: here.latitude + 0.001 })).toBeGreaterThan(
      MOVED_METERS,
    );
  });
});
