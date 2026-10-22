import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from './env';

function createClient() {
  const env = getEnv();
  // P13.9: an explicit pool size (docs/PRODUCTION_DATABASE.md).
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
  return new PrismaClient({ adapter });
}

/*
 * Reuse one client across Next.js dev hot reloads (avoids a new connection pool per edit).
 * The cache is keyed on the generated PrismaClient class: after a migration regenerates
 * the client, the class changes, and a fresh client is created instead of reusing one
 * that doesn't know the new columns.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
  prismaClass?: typeof PrismaClient;
};

if (globalForPrisma.prisma && globalForPrisma.prismaClass !== PrismaClient) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createClient();

if (getEnv().NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaClass = PrismaClient;
}
