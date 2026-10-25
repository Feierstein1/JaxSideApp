/**
 * Idempotent seed (P1.11, P1.12). Safe to run repeatedly.
 * - AppConfiguration: inserts missing keys; never overwrites values an admin has changed.
 * - Achievements: upserts definitions.
 * - Service area: the Duval County boundary (P2.2, D15), from the committed GeoJSON.
 * - Dev places: only outside production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { CONFIG_DEFAULTS, TOS_VERSION } from '@jax/shared';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/crypto';
import { encryptedEmailFields } from '../src/server/crypto/field-encryption';
import { uuidv7 } from '../src/server/crypto/uuid';
import { readBoundaryFile } from '../src/server/location/boundary-file';
import { importServiceArea } from '../src/server/location/service-area';
import { importZipAreas } from '../src/server/stats/zip-areas';
import {
  ACHIEVEMENTS,
  CONFIG_DESCRIPTIONS,
  DEV_PLACES,
  DEV_USERS,
  STARTER_SCREENING_RULES,
} from './seed-data';

export interface SeedOptions {
  includeDevData: boolean;
  /** Dev users are created only when set (SEED_DEV_PASSWORD), so no password lives in git. */
  devPassword?: string;
}

export async function seed(db: PrismaClient, opts: SeedOptions) {
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await db.appConfiguration.upsert({
      where: { key },
      create: { key, value, description: CONFIG_DESCRIPTIONS[key as keyof typeof CONFIG_DEFAULTS] },
      update: {},
    });
  }

  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db); // D116

  for (const r of STARTER_SCREENING_RULES) {
    await db.screeningRule.upsert({
      where: { term_match: { term: r.term, match: 'WORD' } },
      create: { ...r, match: 'WORD' },
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

  if (opts.includeDevData && opts.devPassword) {
    const passwordHash = await hashPassword(opts.devPassword);
    for (const u of DEV_USERS) {
      const now = new Date();
      const id = uuidv7();
      const data = {
        username: u.username,
        passwordHash,
        role: u.role,
        emailVerifiedAt: u.verified ? now : null,
      };
      await db.user.upsert({
        where: { usernameNormalized: u.username.toLowerCase() },
        update: data,
        create: {
          ...data,
          id,
          ...encryptedEmailFields(id, u.email),
          usernameNormalized: u.username.toLowerCase(),
          ageCutoffYear: 2007,
          tosAcceptedAt: now,
          tosVersion: TOS_VERSION,
          adultConfirmedAt: now,
          profile: { create: { bio: u.bio } },
        },
      });
    }
  }

  // Fixture places only fill an empty directory; once real OSM data is imported, they'd
  // just be clutter (some are made up).
  const hasRealPlaces = (await db.businessPlace.count({ where: { sourceName: 'osm' } })) > 0;
  if (opts.includeDevData && !hasRealPlaces) {
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

  // D125 / D131: two sample citywide topics in development (each added once, by its title;
  // the category is kept up to date).
  if (opts.includeDevData) {
    for (const t of [
      {
        title: 'Game day: Jaguars this Sunday',
        category: 'sports',
        description: 'Sample topic for development.',
        pinned: true,
      },
      {
        title: 'Best tacos in Jax',
        category: 'food_fun',
        description: 'Sample topic for development.',
        pinned: false,
      },
    ]) {
      const found = await db.cityTopic.findFirst({ where: { title: t.title } });
      if (found)
        await db.cityTopic.update({ where: { id: found.id }, data: { category: t.category } });
      else await db.cityTopic.create({ data: { ...t, status: 'ACTIVE' } });
    }
  }

  // D123 / D124: one sample poll of each type to try in development (each added once, by its
  // question, open for a week from the first seed).
  if (opts.includeDevData) {
    for (const s of DEV_POLLS) {
      if (await db.poll.findFirst({ where: { question: s.question } })) continue;
      const opensAt = new Date();
      await db.poll.create({
        data: {
          kind: s.kind,
          topic: s.topic,
          question: s.question,
          details: 'Sample poll for development.',
          maxPicks: s.maxPicks ?? null,
          scaleLowLabel: s.scale?.[0] ?? null,
          scaleHighLabel: s.scale?.[1] ?? null,
          opensAt,
          closesAt: new Date(opensAt.getTime() + 7 * 86_400_000),
          choices: {
            create: s.answers.map((label, position) => ({
              label,
              position,
              value: s.kind === 'SCALE' ? position + 1 : null,
            })),
          },
        },
      });
    }
  }
}

const DEV_POLLS: {
  kind: 'YES_NO' | 'SINGLE' | 'MULTI' | 'SCALE';
  topic: string;
  question: string;
  answers: string[];
  maxPicks?: number;
  scale?: [string, string];
}[] = [
  {
    kind: 'SINGLE',
    topic: 'food_fun',
    question: 'What’s your favorite Jacksonville-area beach?',
    answers: ['Jacksonville Beach', 'Neptune Beach', 'Atlantic Beach', 'Hanna Park'],
  },
  {
    kind: 'YES_NO',
    topic: 'transport',
    question: 'Would you ride a train between downtown and the Beaches?',
    answers: ['Yes', 'No', 'Not sure'],
  },
  {
    kind: 'MULTI',
    topic: 'community',
    question: 'What would you most like to see more of near you?',
    answers: ['Parks', 'Restaurants', 'Sidewalks', 'Events', 'Grocery stores'],
    maxPicks: 2,
  },
  {
    kind: 'SCALE',
    topic: 'transport',
    question: 'How would you rate the roads in your area?',
    answers: ['1', '2', '3', '4', '5'],
    scale: ['Very poor', 'Excellent'],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const includeDevData = process.env.NODE_ENV !== 'production';
    await seed(db, { includeDevData, devPassword: process.env.SEED_DEV_PASSWORD || undefined });
    if (includeDevData && !process.env.SEED_DEV_PASSWORD) {
      console.log('SEED_DEV_PASSWORD not set: skipped dev users');
    }
    const counts = {
      config: await db.appConfiguration.count(),
      achievements: await db.achievement.count(),
      places: await db.businessPlace.count(),
      serviceAreas: await db.serviceArea.count(),
      users: await db.user.count(),
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
