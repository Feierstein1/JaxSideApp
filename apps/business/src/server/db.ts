import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from './env';

function createClient() {
  const env = getEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
  return new PrismaClient({ adapter });
}

// Reuse one client across Next.js dev hot reloads (avoids a new pool per edit).
const globalForPrisma = globalThis as unknown as {
  businessPrisma?: ReturnType<typeof createClient>;
};

export const db = globalForPrisma.businessPrisma ?? createClient();

if (getEnv().NODE_ENV !== 'production') globalForPrisma.businessPrisma = db;
