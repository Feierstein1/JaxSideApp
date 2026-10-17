import { describe, expect, it } from 'vitest';
import data from '../data/neighborhoods/duval-neighborhoods.json';
import additions from '../data/neighborhoods/additions.json';
import { readBoundaryFile } from '@/server/location/boundary-file';
import {
  metersBetween,
  nearestNeighborhood,
  NEIGHBORHOOD_MAX_METERS,
} from '@/server/location/neighborhood';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('nearest neighborhood (D72)', () => {
  it('names the closest named point', () => {
    expect(nearestNeighborhood(at(30.3123, -81.7047))).toBe('Avondale');
    expect(nearestNeighborhood(at(30.3199, -81.6849))).toBe('Five Points'); // our own pin
    expect(nearestNeighborhood(at(30.3456, -81.6531))).toBe('Springfield');
    expect(nearestNeighborhood(at(30.305, -81.65))).toBe('San Marco');
  });

  it('says nothing when no named point is close (offshore, rural edge)', () => {
    expect(nearestNeighborhood(at(30.3, -81.2))).toBeNull();
    expect(nearestNeighborhood(at(30.25, -81.98))).toBeNull();
  });

  it('the cut-off is the documented distance', () => {
    const p = data.neighborhoods.find((n) => n.name === 'Baldwin')!;
    const lonPerMeter = 1 / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    const west = (m: number) => at(p.lat, p.lon - m * lonPerMeter);
    // Far west of Baldwin, nothing else is closer.
    expect(nearestNeighborhood(west(NEIGHBORHOOD_MAX_METERS - 100))).toBe('Baldwin');
    expect(nearestNeighborhood(west(NEIGHBORHOOD_MAX_METERS + 100))).toBeNull();
  });

  it('distance is accurate to a few meters at this latitude', () => {
    // 0.01° of latitude ≈ 1,112 m.
    expect(metersBetween({ lat: 30.3, lon: -81.7 }, { lat: 30.31, lon: -81.7 })).toBeCloseTo(
      1112,
      -1,
    );
  });
});

describe('neighborhood data file (D72)', () => {
  const { geometry } = readBoundaryFile();
  // Bounding box of the boundary's rings (a coarse check; the fetch script does the exact one).
  const ring = (geometry.coordinates as unknown[]).flat(geometry.type === 'Polygon' ? 1 : 2) as [
    number,
    number,
  ][];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);

  it('has the well-known neighborhoods and our own pins', () => {
    const names = new Set(data.neighborhoods.map((n) => n.name));
    expect(data.neighborhoods.length).toBeGreaterThan(200);
    for (const n of ['Avondale', 'Riverside', 'Murray Hill', 'San Marco', 'Springfield']) {
      expect(names.has(n)).toBe(true);
    }
    for (const a of additions.neighborhoods) expect(names.has(a.name)).toBe(true);
  });

  it('only has points in the Duval area and no non-neighborhoods', () => {
    for (const n of data.neighborhoods) {
      expect(n.lat).toBeGreaterThanOrEqual(Math.min(...lats));
      expect(n.lat).toBeLessThanOrEqual(Math.max(...lats));
      expect(n.lon).toBeGreaterThanOrEqual(Math.min(...lons));
      expect(n.lon).toBeLessThanOrEqual(Math.max(...lons));
      expect(n.name).not.toMatch(/cemetery|colonia/i);
    }
    // Duval County, Texas shares the OSM area name; none of it may leak in.
    const names = data.neighborhoods.map((n) => n.name);
    for (const texas of ['Freer', 'Benavides', 'Realitos', 'San Diego']) {
      expect(names).not.toContain(texas);
    }
  });
});
