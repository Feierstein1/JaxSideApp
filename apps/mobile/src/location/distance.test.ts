import { describe, expect, it } from 'vitest';
import { hasMoved, MOVED_METERS } from './moved';
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

  // D77: the 30-second check.
  it('a fuzzy fix isn’t a move unless the distance beats its accuracy', () => {
    const at = (dLat: number, acc: number) => ({
      latitude: here.latitude + dLat,
      longitude: here.longitude,
      accuracyMeters: acc,
    });
    const from = at(0, 10);
    expect(hasMoved(undefined, at(0.01, 10))).toBe(false); // nothing loaded yet
    expect(hasMoved(from, at(0.001, 10))).toBe(true); // ~111 m, sharp fix
    expect(hasMoved(from, at(0.001, 150))).toBe(false); // ~111 m but ±150 m
    expect(hasMoved(from, at(0.0003, 10))).toBe(false); // ~33 m
  });
});
