import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../repo-root';

// Used only by the seed, import scripts and tests. Kept out of route bundles so the
// server build doesn't trace the file system.

/**
 * The committed boundary file (P2.1). See docs/DATA_SOURCES.md. Resolved from the repo
 * root at call time: `import.meta.dirname` is undefined inside the Next.js bundle, and
 * the request path never reads this file (only the seed and import scripts do).
 */
export function duvalBoundaryFile(): string {
  return path.join(findRepoRoot(), 'apps/server/data/boundaries/duval-county.geojson');
}

export interface BoundaryFeature {
  type: 'Feature';
  properties: {
    key: string;
    name: string;
    sourceUrl: string;
    sourceVersion: string;
    license: string;
  };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

export function readBoundaryFile(file = duvalBoundaryFile()): BoundaryFeature {
  const feature = JSON.parse(readFileSync(file, 'utf8')) as BoundaryFeature;
  if (feature.type !== 'Feature' || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
    throw new Error(`${file} is not a Polygon/MultiPolygon GeoJSON Feature`);
  }
  return feature;
}
