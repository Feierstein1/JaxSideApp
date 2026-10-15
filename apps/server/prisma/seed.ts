/**
 * Idempotent seed (P1.11, P1.12). Safe to run repeatedly.
 * - AppConfiguration: inserts missing keys; never overwrites values an admin has changed.
 * - Achievements: upserts definitions.
 * - Dev places: only outside production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { CONFIG_DEFAULTS } from '@jax/shared';
import { PrismaClient } from '../src/generated/prisma/client';
import { ACHIEVEMENTS, CONFIG_DESCRIPTIONS, DEV_PLACES } from './seed-data';

export async function seed(db: PrismaClient, opts: { includeDevData: boolean }) {
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await db.appConfiguration.upsert({
      where: { key },
      create: { key, value, description: CONFIG_DESCRIPTIONS[key as keyof typeof CONFIG_DEFAULTS] },
      update: {},
    });
  }

  for (const a of ACHIEVEMENTS) {
    const data = { name: a.name, description: a.description, icon: a.icon, criteria: a.criteria };
    await db.achievement.upsert({
      where: { key: a.key },
      create: { key: a.key, ...data },
      update: data,
    });
  }

  if (opts.includeDevData) {
    for (const p of DEV_PLACES) {
      await db.$executeRaw`
        INSERT INTO "BusinessPlace" (id, name, "nameNormalized", category, latitude, longitude, location,
                                     "sourceName", "sourceId", attribution, "updatedAt")
        VALUES (gen_random_uuid(), ${p.name}, ${p.name.toLowerCase()}, ${p.category}, ${p.lat}, ${p.lng},
                ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
                'dev-seed', ${p.sourceId}, 'Development fixture', now())
        ON CONFLICT ("sourceName", "sourceId") DO UPDATE
          SET name = EXCLUDED.name, "nameNormalized" = EXCLUDED."nameNormalized",
              category = EXCLUDED.category, latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude, location = EXCLUDED.location, "updatedAt" = now()`;
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const includeDevData = process.env.NODE_ENV !== 'production';
    await seed(db, { includeDevData });
    const counts = {
      config: await db.appConfiguration.count(),
      achievements: await db.achievement.count(),
      places: await db.businessPlace.count(),
    };
    console.log('seed complete', counts);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
