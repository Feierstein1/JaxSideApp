/**
 * D99: downloads the Duval map tiles (a Protomaps extract of OpenStreetMap, ODbL) into
 * apps/server/data/map/duval.pmtiles. Only the county area is fetched (~41 MB), not the
 * whole planet. Needs the free `pmtiles` command-line tool
 * (https://github.com/protomaps/go-pmtiles/releases); point PMTILES_BIN at it if it isn't
 * on your PATH.
 *
 *   npm run fetch:map -w @jax/server [-- 20261020]   (build date; default: latest)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { MAP_BOUNDS } from '../../src/server/map/tiles';

const BIN = process.env.PMTILES_BIN ?? 'pmtiles';
const OUT = path.resolve(import.meta.dirname, '../../data/map/duval.pmtiles');

async function latestBuild(): Promise<string> {
  const res = await fetch('https://build-metadata.protomaps.dev/builds.json');
  if (!res.ok) throw new Error(`Couldn't list Protomaps builds: HTTP ${res.status}`);
  const builds = (await res.json()) as { key: string }[];
  const keys = builds.map((b) => b.key).filter((k) => /^\d{8}\.pmtiles$/.test(k));
  keys.sort();
  return keys[keys.length - 1]!.replace('.pmtiles', '');
}

async function main() {
  const build = process.argv[2] ?? (await latestBuild());
  const tmp = `${OUT}.download`;
  mkdirSync(path.dirname(OUT), { recursive: true });
  console.log(`Extracting Duval from Protomaps build ${build} ...`);
  execFileSync(
    BIN,
    [
      'extract',
      `https://build.protomaps.com/${build}.pmtiles`,
      tmp,
      `--bbox=${MAP_BOUNDS.join(',')}`,
      '--maxzoom=15',
    ],
    { stdio: 'inherit' },
  );
  renameSync(tmp, OUT);
  console.log(`Saved ${(statSync(OUT).size / 1e6).toFixed(1)} MB to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
