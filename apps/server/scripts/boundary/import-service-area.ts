/**
 * P2.2: Loads data/boundaries/duval-county.geojson into the ServiceArea table.
 * Idempotent. The seed also runs this, so it's only needed on its own after
 * refreshing the boundary file.
 *
 *   npm run import:boundary -w @jax/server
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { readBoundaryFile } from '../../src/server/location/boundary-file';
import { importServiceArea } from '../../src/server/location/service-area';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const feature = readBoundaryFile();
    await importServiceArea(db, feature);
    const [row] = await db.$queryRaw<{ key: string; sq_mi: number; valid: boolean }[]>`
      SELECT key, round((ST_Area(geom) / 2589988.11)::numeric, 1)::float AS sq_mi,
             ST_IsValid(geom::geometry) AS valid
      FROM "ServiceArea" WHERE key = ${feature.properties.key}`;
    console.log('service area imported', row);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
