-- CreateEnum
CREATE TYPE "LocationFlagKind" AS ENUM ('IMPOSSIBLE_TRAVEL', 'SUSPICIOUS_TRAVEL', 'MOCKED_LOCATION');

-- AlterTable
ALTER TABLE "Installation" ADD COLUMN     "tokenHash" CHAR(64) NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "installationId" UUID;

-- CreateTable
CREATE TABLE "LocationFlag" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestSessionId" UUID,
    "kind" "LocationFlagKind" NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "elapsedSeconds" DOUBLE PRECISION,
    "restrictedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" UUID,

    CONSTRAINT "LocationFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationFlag_userId_createdAt_idx" ON "LocationFlag"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LocationFlag_guestSessionId_createdAt_idx" ON "LocationFlag"("guestSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LocationFlag_reviewedAt_createdAt_idx" ON "LocationFlag"("reviewedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_tokenHash_key" ON "Installation"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_installationId_idx" ON "Session"("installationId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFlag" ADD CONSTRAINT "LocationFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFlag" ADD CONSTRAINT "LocationFlag_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFlag" ADD CONSTRAINT "LocationFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: a flag belongs to exactly one actor; measured values are non-negative.
ALTER TABLE "LocationFlag" ADD CONSTRAINT "LocationFlag_one_actor"
  CHECK (num_nonnulls("userId", "guestSessionId") = 1);
ALTER TABLE "LocationFlag" ADD CONSTRAINT "LocationFlag_values_nonneg"
  CHECK (("speedKmh" IS NULL OR "speedKmh" >= 0) AND ("distanceKm" IS NULL OR "distanceKm" >= 0)
     AND ("elapsedSeconds" IS NULL OR "elapsedSeconds" >= 0));
